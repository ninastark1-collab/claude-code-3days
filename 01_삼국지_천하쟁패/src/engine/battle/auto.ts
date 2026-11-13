/**
 * 작전 자동 전투: 부대 배치와 자동 행동 (전투개편 설계서 10장, 1단계 범위)
 * - 기존 전투 규칙(이동·피해·지형·사기·화계·일기토·공성)은 battle.ts 그대로 쓰고,
 *   여기서는 "작전에 따라 어떤 명령을 내릴지"만 정한다.
 * - 수비군은 방침에 따라 성 앞 들판에 진을 친다. 성은 밀렸을 때 물러날 마지막 거점이다.
 */
import { decideAttacker } from './ai';
import { activeUnits, applyTactic, attackRange, dist, passable, pushCinematic, rngOf, stepBattle, tacticChance, tileAt, unitAt } from './battle';
import { duelCheck } from './duel';
import { assignAllAutoKinds, IN_CASTLE_POLICIES } from './kinds';
import { aiChoosePolicy, defaultPlan, executionOf, POLICIES, unitPlan } from './plan';
import type { AtkPolicy, BattleState, BUnit, DefPolicy, Role, Side, SidePlan } from './types';

type Pt = readonly [number, number];
const DECIDE_EVERY = 3;
const inCastle = (x: number, y: number) => x >= 16 && x <= 22 && y >= 5 && y <= 11;

/** 방침·역할별 배치 기준점 (24×16 전장, 공격군은 서쪽, 성은 동쪽 16~22) */
const ATK_POS: Record<AtkPolicy, Record<Role, Pt>> = {
  atk_front: { vanguard: [4, 8], main: [3, 8], left: [3, 5], right: [3, 11], reserve: [1, 8] },
  atk_pincer: { vanguard: [4, 8], main: [2, 8], left: [3, 3], right: [3, 13], reserve: [1, 8] },
  atk_wedge: { vanguard: [5, 8], main: [4, 8], left: [4, 7], right: [4, 9], reserve: [3, 8] },
  atk_feint: { vanguard: [4, 5], main: [3, 10], left: [3, 4], right: [3, 12], reserve: [2, 10] },
  atk_lure: { vanguard: [5, 8], main: [3, 8], left: [3, 5], right: [3, 11], reserve: [1, 8] },
  atk_fire: { vanguard: [4, 8], main: [2, 8], left: [3, 6], right: [3, 10], reserve: [1, 8] },
};
/**
 * 수비 배치. 견고 수비·종심 방어·지연전은 성 안(농성): 궁병은 성벽 칸(CASTLE_WALL), 나머지는 성문 뒤·본성 앞(아래 좌표).
 * 유인 역습·매복 요격·선제 출격은 성 밖 들판.
 */
const DEF_POS: Record<DefPolicy, Record<Role, Pt>> = {
  def_hold: { vanguard: [17, 8], main: [18, 8], left: [17, 7], right: [17, 9], reserve: [18, 7] },
  def_depth: { vanguard: [17, 8], main: [18, 8], left: [17, 6], right: [17, 10], reserve: [18, 9] },
  def_counter: { vanguard: [12, 8], main: [15, 8], left: [12, 3], right: [12, 13], reserve: [15, 6] },
  def_ambush: { vanguard: [13, 8], main: [14, 8], left: [10, 5], right: [10, 11], reserve: [15, 8] },
  def_sally: { vanguard: [11, 8], main: [12, 8], left: [11, 5], right: [11, 11], reserve: [13, 8] },
  def_delay: { vanguard: [17, 8], main: [18, 8], left: [17, 7], right: [17, 9], reserve: [18, 7] },
};
/** 농성 궁병 자리: 서쪽 성벽(공격군 쪽) 먼저, 그다음 남북 성벽 서쪽 칸 */
const CASTLE_WALL: Pt[] = [[16, 7], [16, 9], [16, 6], [16, 10], [17, 5], [17, 11], [18, 5], [18, 11], [16, 5], [16, 11], [20, 5], [20, 11]];
/** 숨는 역할 */
const HIDERS: Partial<Record<AtkPolicy | DefPolicy, Role[]>> = {
  atk_lure: ['main', 'left', 'right'],
  def_ambush: ['left', 'right'],
};

// ───────────────────────────── 준비 ─────────────────────────────

/** 작전 자동 전투로 만든다. AI 쪽 작전은 여기서 정한다 */
export function preparePlannedBattle(b: BattleState, aiSides: Side[]): void {
  b.auto = true;
  b.plans ??= {};
  const rng = rngOf(b);
  for (const side of aiSides) if (!b.plans[side]) b.plans[side] = defaultPlan(b, side, aiChoosePolicy(b, side, () => rng.next()), true);
  assignAllAutoKinds(b);
}

/** 작전 확정 (실행도는 확정 시점 값) */
export function setPlan(b: BattleState, side: Side, plan: SidePlan): void {
  b.plans ??= {};
  b.plans[side] = { ...plan, execution: executionOf(b, side) };
  assignAllAutoKinds(b);
}

/** 양쪽 작전이 정해지면 배치하고 전투를 시작한다 */
export function startPlannedBattle(b: BattleState): void {
  if (b.started) return;
  if (!b.plans?.atk || !b.plans.def) throw new Error('양쪽 작전이 모두 정해져야 합니다.');
  b.auto = true;
  // 수비 방침(성 안/성 밖)이 확정됐으니 자동 병과를 그에 맞춘다
  assignAllAutoKinds(b);
  deploy(b, 'def');
  deploy(b, 'atk');
  b.started = true;
  b.log.push('작전 개시! 양군이 진을 펼쳤다.');
}

function freeNear(b: BattleState, u: BUnit, x: number, y: number, ok: (x: number, y: number) => boolean = () => true): Pt | null {
  for (let r = 0; r <= 8; r++)
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const nx = x + dx;
        const ny = y + dy;
        if (!passable(b, u, nx, ny) || !ok(nx, ny)) continue;
        const occ = unitAt(b, nx, ny);
        if (occ && occ !== u) continue;
        return [nx, ny];
      }
  return null;
}

function deploy(b: BattleState, side: Side): void {
  const plan = b.plans![side]!;
  const pos = side === 'atk' ? ATK_POS[plan.policy as AtkPolicy] : DEF_POS[plan.policy as DefPolicy];
  const hiders = HIDERS[plan.policy as AtkPolicy] ?? [];
  const us = activeUnits(b, side);
  // 기존 자리에서 잠시 빼 두고 다시 놓는다 (서로 자리를 막지 않게)
  for (const u of us) u.x = u.y = -10;
  const roleIdx: Partial<Record<Role, number>> = {};
  const outsideCastle = (x: number, y: number) => !inCastle(x, y) && (side === 'atk' ? x <= 8 : x >= 6 && x <= 15);
  const inCastlePlan = side === 'def' && IN_CASTLE_POLICIES.includes(plan.policy as DefPolicy);
  for (const u of us) {
    const up = plan.units[u.id] ?? { role: 'reserve' as Role };
    if (inCastlePlan) {
      // 농성: 궁병은 성벽 위, 나머지는 성 안 (성문 뒤·본성 앞)
      const wall = u.kind === 'archer' ? CASTLE_WALL.find(([x, y]) => tileAt(b, x, y)?.t === 'wall' && !unitAt(b, x, y)) : undefined;
      const [ax, ay] = pos[up.role];
      const spot = wall ?? freeNear(b, u, ax, ay, (x, y) => inCastle(x, y) && tileAt(b, x, y)?.t === 'town') ?? freeNear(b, u, ax, ay, inCastle);
      if (spot) {
        u.x = spot[0];
        u.y = spot[1];
        u.anchor = { x: spot[0], y: spot[1] };
        u.phase = 0;
        u.engaged = 0;
        u.order = { type: 'hold' };
        continue;
      }
    }
    const k = (roleIdx[up.role] = (roleIdx[up.role] ?? -1) + 1);
    const [ax, ay] = pos[up.role];
    // 같은 역할이 여럿이면 위아래로 벌린다
    const oy = k === 0 ? 0 : (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 2;
    const tx = ax;
    const ty = Math.max(0, Math.min(b.h - 1, ay + oy));
    let spot: Pt | null = null;
    if (hiders.includes(up.role)) {
      const xs: [number, number] = side === 'atk' ? [2, 9] : [6, 14];
      spot = freeNear(b, u, tx, ty, (x, y) => {
        const t = tileAt(b, x, y)!.t;
        return (t === 'forest' || t === 'mountain') && x >= xs[0] && x <= xs[1];
      });
      if (spot) u.hidden = true;
    }
    spot ??= freeNear(b, u, tx, ty, outsideCastle) ?? freeNear(b, u, tx, ty);
    if (!spot) continue;
    u.x = spot[0];
    u.y = spot[1];
    u.anchor = { x: spot[0], y: spot[1] };
    u.phase = 0;
    u.engaged = 0;
    u.order = { type: 'hold' };
  }
}

// ───────────────────────────── 매 틱 판단 ─────────────────────────────

const foesOf = (b: BattleState, u: BUnit) => activeUnits(b, u.side === 'atk' ? 'def' : 'atk').filter((e) => !e.hidden);
function nearestTo(list: BUnit[], x: number, y: number): BUnit | undefined {
  let best: BUnit | undefined;
  let bd = Infinity;
  for (const e of list) {
    const d = dist(e.x, e.y, x, y) + e.troops / 1e6;
    if (d < bd) (bd = d), (best = e);
  }
  return best;
}
const centroid = (list: BUnit[]): Pt => {
  if (!list.length) return [12, 8];
  return [Math.round(list.reduce((s, u) => s + u.x, 0) / list.length), Math.round(list.reduce((s, u) => s + u.y, 0) / list.length)];
};

function moveNear(b: BattleState, u: BUnit, x: number, y: number): void {
  x = Math.max(0, Math.min(b.w - 1, Math.round(x)));
  y = Math.max(0, Math.min(b.h - 1, Math.round(y)));
  if (u.x === x && u.y === y) {
    u.order = { type: 'hold' };
    return;
  }
  const spot = freeNear(b, u, x, y);
  if (!spot || (spot[0] === u.x && spot[1] === u.y)) u.order = { type: 'hold' };
  else u.order = { type: 'move', x: spot[0], y: spot[1] };
}
const engage = (u: BUnit, t: BUnit | undefined) => {
  if (t) u.order = { type: 'attack', target: t.id };
};

/** 작전 쪽 부대들의 명령을 정한다. 매 틱 stepBattle 전에 부른다 */
export function planAi(b: BattleState): void {
  if (b.result || !b.started || !b.plans) return;
  // 매복 발각: 적이 2칸 안에 들어오면 뛰쳐나온다
  for (const u of activeUnits(b)) {
    const near = activeUnits(b, u.side === 'atk' ? 'def' : 'atk').some((e) => dist(e.x, e.y, u.x, u.y) <= (u.hidden ? 2 : attackRange(b, u)));
    u.engaged = near ? (u.engaged ?? 0) + 1 : 0;
    if (u.hidden && near) reveal(b, u);
  }
  // 일기토 (v2 설계서 9-2): 작전 자동 전투에서도 판정한다
  duelCheck(b);
  const all = activeUnits(b);
  all.forEach((u, i) => {
    if (u.status !== 'active' || u.confused || u.hidden) return;
    if ((b.tick + i) % DECIDE_EVERY !== 0 && u.order.type !== 'hold') return;
    decide(b, u);
  });
}

function reveal(b: BattleState, u: BUnit): void {
  u.hidden = false;
  u.ambushTicks = 12;
  for (const e of activeUnits(b, u.side === 'atk' ? 'def' : 'atk')) if (dist(e.x, e.y, u.x, u.y) <= 3) e.morale = Math.max(0, e.morale - 8);
  b.log.push(`복병이다! ${u.name} 부대가 매복에서 뛰쳐나왔다`);
  pushCinematic(b, { kind: 'banner', text: `복병이다! ${u.name} 부대가 뛰쳐나온다`, tone: 'stratagem', side: u.side, x: u.x, y: u.y });
}

function revealAll(b: BattleState, side: Side): void {
  for (const u of activeUnits(b, side)) if (u.hidden) reveal(b, u);
}

function decide(b: BattleState, u: BUnit): void {
  const plan = b.plans![u.side]!;
  const up = unitPlan(b, u) ?? { role: 'reserve' as Role, stance: 'balanced' as const, retreatAt: 0.3 };
  // 퇴각 기준
  if (u.order.type === 'retreat') return;
  if (up.retreatAt > 0 && u.troops < u.startTroops * up.retreatAt) {
    u.order = { type: 'retreat' };
    b.log.push(`${u.name} 부대가 퇴각 기준(${Math.round(up.retreatAt * 100)}%)에 따라 물러난다`);
    return;
  }
  const foes = foesOf(b, u);
  // 사기가 떨어지면 고무 (장수 능력에 맡김)
  if (u.tacCd === 0 && u.morale < 40 && tacticChance(b, u, 'inspire') >= 55) applyTactic(b, u, 'inspire', u.x, u.y);
  if (u.side === 'atk') decideAtk(b, u, plan, up.role, foes);
  else decideDef(b, u, plan, up.role, foes);
  // 신중한 부대는 혼자 너무 많은 적에 둘러싸이면 한 발 물러선다
  if (up.stance === 'cautious' && u.order.type === 'attack') {
    const around = foes.filter((e) => dist(e.x, e.y, u.x, u.y) <= 2).reduce((s, e) => s + e.troops, 0);
    if (around > u.troops * 1.8 && u.anchor) moveNear(b, u, (u.x + u.anchor.x) / 2, (u.y + u.anchor.y) / 2);
  }
}

// ───────────────────────────── 공격 방침 ─────────────────────────────

function decideAtk(b: BattleState, u: BUnit, plan: SidePlan, role: Role, foes: BUnit[]): void {
  const allFoes = activeUnits(b, 'def');
  const field = foes.filter((f) => !inCastle(f.x, f.y));
  // 들판에 보이는 적이 없으면 성을 친다 (기존 공성 판단)
  if (!field.length) {
    const near = nearestTo(foes.length ? foes : allFoes, u.x, u.y);
    if (near) decideAttacker(b, u, foes.length ? foes : allFoes, near);
    else u.order = { type: 'move', x: b.keep.x, y: b.keep.y };
    return;
  }
  const [ex] = centroid(field);
  const nearest = nearestTo(field, u.x, u.y)!;
  const day = b.day;
  const lost = b.units.some((x) => x.side === 'atk' && x.status !== 'active');
  switch (plan.policy as AtkPolicy) {
    case 'atk_front':
      if (role === 'reserve' && day < 2 && !lost) return moveNear(b, u, Math.min(ex - 4, u.x + 2), 8);
      return engage(u, nearest);
    case 'atk_pincer': {
      if (role === 'left' || role === 'right') {
        const fy = role === 'left' ? 2 : 13;
        const fx = Math.min(14, ex);
        if (u.phase === 0 && dist(u.x, u.y, fx, fy) > 2 && day < 3) return moveNear(b, u, fx, fy);
        u.phase = 1;
        return engage(u, nearestTo(field, u.x, u.y));
      }
      const wingsOut = activeUnits(b, 'atk').some((w) => (plan.units[w.id]?.role === 'left' || plan.units[w.id]?.role === 'right') && w.phase === 0);
      if (wingsOut && day < 3 && dist(nearest.x, nearest.y, u.x, u.y) > 2) return moveNear(b, u, ex - 4, role === 'reserve' ? 8 : u.anchor?.y ?? 8);
      if (role === 'reserve' && day < 2) return moveNear(b, u, ex - 5, 8);
      return engage(u, nearest);
    }
    case 'atk_wedge': {
      const defCmd = b.plans?.def?.commander;
      const target = field.find((f) => f.id === defCmd) ?? field.reduce((a, f) => (Math.abs(f.y - 8) + f.x / 10 < Math.abs(a.y - 8) + a.x / 10 ? f : a));
      if (role === 'reserve' && day < 2) return moveNear(b, u, Math.min(ex - 3, u.x + 3), 8);
      // 붙어 있는 적은 먼저 처리 (옆구리를 내주지 않게)
      if (dist(nearest.x, nearest.y, u.x, u.y) <= 1) return engage(u, nearest);
      return engage(u, target);
    }
    case 'atk_feint': {
      const decoy = role === 'vanguard' || role === 'left';
      if (decoy) return engage(u, nearestTo(field, ex, 3));
      const strike = b.tick >= 18 || day >= 2;
      if (!strike && dist(nearest.x, nearest.y, u.x, u.y) > 2) return moveNear(b, u, ex - 3, 12);
      return engage(u, nearestTo(field, ex, 12));
    }
    case 'atk_lure': {
      const hiddenAllies = activeUnits(b, 'atk').filter((a) => a.hidden);
      if (day >= 3 && hiddenAllies.length) revealAll(b, 'atk');
      if (role === 'vanguard') {
        const [lx, ly] = hiddenAllies.length ? centroid(hiddenAllies) : [u.anchor?.x ?? 3, 8];
        if (u.phase === 0) {
          if ((u.engaged ?? 0) >= 3 || u.troops < u.startTroops * 0.9) {
            u.phase = 1;
            b.log.push(`${u.name} 부대가 패주하는 척 물러난다`);
          } else return engage(u, nearest);
        }
        if (u.phase === 1 && hiddenAllies.length && dist(u.x, u.y, lx, ly) > 1) return moveNear(b, u, lx - 1, ly);
        u.phase = 2;
        return engage(u, nearest);
      }
      if (hiddenAllies.length && day < 3) return moveNear(b, u, u.anchor?.x ?? u.x, u.anchor?.y ?? u.y);
      return engage(u, nearest);
    }
    case 'atk_fire': {
      const starters = activeUnits(b, 'atk')
        .filter((a) => a.int >= 70 || a.skills.includes('fire'))
        .sort((a, c) => c.int - a.int)
        .slice(0, 2);
      if (starters.includes(u)) {
        if (u.tacCd === 0 && b.weather !== 'rain') {
          const t = bestFireTarget(b, u, field);
          if (t) {
            applyTactic(b, u, 'fire', t[0], t[1]);
            return;
          }
        }
        const d = dist(nearest.x, nearest.y, u.x, u.y);
        if (d > 3) return moveNear(b, u, nearest.x - 3, nearest.y);
        if (d <= 1) return engage(u, nearest);
        u.order = { type: 'hold' };
        return;
      }
      const burned = b.tiles.some((t) => t.fire) || field.some((f) => f.troops < f.startTroops * 0.85);
      if (!burned && day < 3 && dist(nearest.x, nearest.y, u.x, u.y) > 2) return moveNear(b, u, ex - 5, u.anchor?.y ?? 8);
      return engage(u, nearest);
    }
  }
}

/** 불을 놓을 칸: 3칸 안, 아군이 붙어 있지 않고, 숲·성내이거나 적이 모여 있는 곳 */
function bestFireTarget(b: BattleState, u: BUnit, field: BUnit[]): Pt | null {
  let best: Pt | null = null;
  let bs = 0;
  for (const f of field) {
    if (dist(f.x, f.y, u.x, u.y) > 3) continue;
    const t = tileAt(b, f.x, f.y)!.t;
    if (t === 'river' || t === 'water') continue;
    if (activeUnits(b, u.side).some((a) => dist(a.x, a.y, f.x, f.y) <= 1)) continue;
    const cluster = field.filter((o) => dist(o.x, o.y, f.x, f.y) <= 1).length;
    const s = cluster + (t === 'forest' || t === 'town' ? 1.5 : 0);
    if (s > bs) (bs = s), (best = [f.x, f.y]);
  }
  return best;
}

// ───────────────────────────── 방어 방침 ─────────────────────────────

const isWallish = (b: BattleState, x: number, y: number) => {
  const t = tileAt(b, x, y)?.t;
  return t === 'wall' || t === 'gate';
};

/**
 * 농성 수비: 성 안으로 들어온 적은 모두가 친다.
 * - 궁병: 적과 가장 가까운 빈 성벽 칸으로 올라가 쏜다 (성벽 위 궁병 사거리 3)
 * - 보병·기병: 적과 가장 가까운 성문 바로 안쪽에서 대기, 성문이 뚫리면(성 안에 적) 달려든다
 */
function siegeDefense(b: BattleState, u: BUnit, foes: BUnit[]): void {
  const inside = foes.filter((f) => inCastle(f.x, f.y) && !isWallish(b, f.x, f.y));
  if (inside.length && u.kind !== 'archer') return engage(u, nearestTo(inside, u.x, u.y));
  const ref = nearestTo(foes, b.keep.x, b.keep.y)!;
  if (u.kind === 'archer') {
    const r = attackRange(b, u);
    const inRange = foes.filter((f) => dist(f.x, f.y, u.x, u.y) <= r);
    if (isWallish(b, u.x, u.y) && inRange.length) return engage(u, inRange.reduce((a, f) => (f.troops < a.troops ? f : a)));
    // 적에게 가장 가까운 빈 성벽 칸
    let best: Pt | null = null;
    let bd = Infinity;
    for (let y = 5; y <= 11; y++)
      for (let x = 16; x <= 22; x++) {
        if (!isWallish(b, x, y)) continue;
        const occ = unitAt(b, x, y);
        if (occ && occ !== u) continue;
        const d = dist(x, y, ref.x, ref.y) + dist(x, y, u.x, u.y) * 0.3;
        if (d < bd) (bd = d), (best = [x, y]);
      }
    if (best && !(best[0] === u.x && best[1] === u.y)) {
      u.order = { type: 'move', x: best[0], y: best[1] };
      return;
    }
    if (inRange.length) return engage(u, inRange[0]);
    u.order = { type: 'hold' };
    return;
  }
  // 성문 뒤 대기: 적과 가장 가까운 성문(무너졌으면 그 자리)의 안쪽 칸
  let gate: Pt | null = null;
  let gd = Infinity;
  for (let y = 5; y <= 11; y++)
    for (let x = 16; x <= 22; x++) {
      const ring = x === 16 || x === 22 || y === 5 || y === 11;
      const t = tileAt(b, x, y)!.t;
      if (!ring || t === 'wall') continue; // 성문이거나 무너진 자리
      const d = dist(x, y, ref.x, ref.y);
      if (d < gd) (gd = d), (gate = [x, y]);
    }
  if (!gate) return moveNear(b, u, b.keep.x, b.keep.y);
  // 성문에 붙은 적은 성문 안쪽에서 바로 친다
  const atGate = foes.find((f) => dist(f.x, f.y, gate![0], gate![1]) <= 1 && dist(f.x, f.y, u.x, u.y) <= attackRange(b, u));
  if (atGate) return engage(u, atGate);
  const ix = gate[0] === 16 ? 17 : gate[0] === 22 ? 21 : gate[0];
  const iy = gate[1] === 5 ? 6 : gate[1] === 11 ? 10 : gate[1];
  const spot = freeNear(b, u, ix, iy, (x, y) => inCastle(x, y) && !isWallish(b, x, y));
  if (!spot || (spot[0] === u.x && spot[1] === u.y)) {
    u.order = { type: 'hold' };
    return;
  }
  u.order = { type: 'move', x: spot[0], y: spot[1] };
}

function decideDef(b: BattleState, u: BUnit, plan: SidePlan, role: Role, foes: BUnit[]): void {
  const anchor = u.anchor ?? { x: b.keep.x, y: b.keep.y };
  // 본성이 위험하면 역할과 상관없이 막는다
  const keepThreat = nearestTo(
    foes.filter((f) => dist(f.x, f.y, b.keep.x, b.keep.y) <= 3),
    b.keep.x,
    b.keep.y,
  );
  if (keepThreat) return engage(u, keepThreat);
  if (!foes.length) {
    if (b.day >= 4) revealAll(b, 'def');
    return moveNear(b, u, anchor.x, anchor.y);
  }
  // 농성: 성 안에 있는 부대는 놀지 않는다 (궁병은 성벽 위에서 쏘고, 보병·기병은 성문 뒤에서 뚫릴 때를 대비한다)
  if (inCastle(u.x, u.y) || inCastle(anchor.x, anchor.y)) return siegeDefense(b, u, foes);
  const nearest = nearestTo(foes, u.x, u.y)!;
  const r = attackRange(b, u);
  const holdLine = (reach: number) => {
    const t = nearestTo(foes, anchor.x, anchor.y)!;
    if (dist(t.x, t.y, anchor.x, anchor.y) <= reach + r) return engage(u, t);
    return moveNear(b, u, anchor.x, anchor.y);
  };
  switch (plan.policy as DefPolicy) {
    case 'def_hold':
      return holdLine(2);
    case 'def_depth':
      return holdLine(role === 'main' || role === 'reserve' ? 3 : 2);
    case 'def_counter': {
      if (role === 'vanguard') {
        if (u.phase === 0 && dist(nearest.x, nearest.y, u.x, u.y) <= 2) {
          u.phase = 1;
          b.log.push(`${u.name} 부대가 일부러 중앙을 내준다`);
        }
        if (u.phase === 1) {
          if (dist(u.x, u.y, 15, 8) > 1) return moveNear(b, u, 15, 8);
          u.phase = 2;
        }
        return holdLine(2);
      }
      if (role === 'left' || role === 'right') {
        const inPocket = foes.filter((f) => f.x >= 10 && f.y >= 5 && f.y <= 11);
        if (inPocket.length || b.day >= 3) return engage(u, nearestTo(inPocket.length ? inPocket : foes, u.x, u.y));
        return moveNear(b, u, anchor.x, anchor.y);
      }
      return holdLine(3);
    }
    case 'def_ambush':
      if (b.day >= 4) revealAll(b, 'def');
      if (role === 'left' || role === 'right') return engage(u, nearest); // 매복에서 나온 뒤
      return holdLine(2);
    case 'def_sally':
      if (role === 'reserve' && b.day < 2) return holdLine(3);
      return engage(u, nearest);
    case 'def_delay': {
      // 앞에서 버티다 병력이 60% 아래로 줄면 성 안으로 물러나 성벽을 끼고 싸운다
      if (u.troops < u.startTroops * 0.6 && !inCastle(anchor.x, anchor.y)) {
        const spot = freeNear(b, u, 17, Math.max(6, Math.min(10, anchor.y)), (x, y) => inCastle(x, y));
        if (spot) {
          u.anchor = { x: spot[0], y: spot[1] };
          return moveNear(b, u, spot[0], spot[1]);
        }
      }
      return holdLine(1);
    }
  }
}

// ───────────────────────────── 전체 자동 진행 ─────────────────────────────

/** 양쪽 모두 작전대로 끝까지 진행 (결과만 보기, AI끼리 전투) */
export function runPlannedBattle(b: BattleState): void {
  if (!b.started) startPlannedBattle(b);
  let guard = 0;
  while (!b.result && guard++ < 2400) {
    planAi(b);
    stepBattle(b);
  }
  // 아무도 재생하지 않으므로 연출 큐는 비운다 (일기토는 b.duels 와 보고서 카드에 남는다)
  b.cinematics = [];
}

/** 한 틱: 작전 판단 + 진행 (관전 화면에서 사용) */
export function tickPlanned(b: BattleState, n: number): void {
  for (let i = 0; i < n && !b.result; i++) {
    planAi(b);
    stepBattle(b);
  }
}

export { POLICIES };
