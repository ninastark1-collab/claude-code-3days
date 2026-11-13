import {
  activeUnits,
  canReach,
  dist,
  duelAccepted,
  rngOf,
  runDuel,
  tacticChance,
  tileAt,
  applyTactic,
  attackRange,
  passable,
  unitAt,
} from './battle';
import type { BattleState, BUnit, Side } from './types';
import { MAX_DUELS } from './duel';

const inCastle = (x: number, y: number) => x >= 16 && x <= 22 && y >= 5 && y <= 11;
const DECIDE_EVERY = 6;

/** 플레이어가 조작하지 않는 쪽 부대들의 명령을 정한다 (매 틱 호출해도 됨) */
export function battleAi(b: BattleState, sides: Side[]): void {
  if (b.result) return;
  for (const u of activeUnits(b)) {
    if (!sides.includes(u.side)) continue;
    // 부대마다 결정 시점을 분산
    if ((b.tick + u.officer.length) % DECIDE_EVERY !== 0) continue;
    decide(b, u);
  }
}

function power(us: BUnit[]): number {
  return us.reduce((s, u) => s + u.troops * (u.lea + u.war) / 140, 0);
}

function decide(b: BattleState, u: BUnit): void {
  if (u.confused) return;
  const rng = rngOf(b);
  const foes = activeUnits(b, u.side === 'atk' ? 'def' : 'atk');
  if (!foes.length) {
    if (u.side === 'atk') u.order = { type: 'move', x: b.keep.x, y: b.keep.y };
    return;
  }
  // 퇴각 판단
  if (u.troops < u.startTroops * 0.15 && u.morale < 35) {
    u.order = { type: 'retreat' };
    return;
  }
  const nearest = foes.reduce((a, f) => (dist(f.x, f.y, u.x, u.y) < dist(a.x, a.y, u.x, u.y) ? f : a));
  const nd = dist(nearest.x, nearest.y, u.x, u.y);

  // 계략
  if (u.tacCd === 0) {
    if (u.morale < 40 && tacticChance(b, u, 'inspire') >= 50) {
      applyTactic(b, u, 'inspire', u.x, u.y);
    } else if (nd <= 3 && u.int >= 70) {
      const nt = tileAt(b, nearest.x, nearest.y)!;
      const fireP = tacticChance(b, u, 'fire', nearest);
      const allyNear = activeUnits(b, u.side).some((a) => a !== u && dist(a.x, a.y, nearest.x, nearest.y) <= 1);
      if (fireP >= 50 && !allyNear && (nt.t === 'forest' || nt.t === 'town' || b.fireBoost || rng.chance(40))) {
        applyTactic(b, u, 'fire', nearest.x, nearest.y);
      } else if (tacticChance(b, u, 'confuse', nearest) >= 50) {
        applyTactic(b, u, 'confuse', nearest.x, nearest.y);
      }
    }
  }

  // 일기토 신청 (무력 높은 장수)
  if (u.war >= 85 && !u.dueled && b.duels.length < MAX_DUELS && nd <= 1 && nearest.war <= u.war && rng.chance(8)) {
    if (duelAccepted(b, u, nearest)) {
      runDuel(b, u, nearest);
      return;
    }
  }

  if (u.side === 'atk') decideAttacker(b, u, foes, nearest);
  else decideDefender(b, u, foes, nearest);
}

export function decideAttacker(b: BattleState, u: BUnit, foes: BUnit[], nearest: BUnit): void {
  const outside = foes.filter((f) => !inCastle(f.x, f.y));
  if (outside.length) {
    const t = outside.reduce((a, f) => (dist(f.x, f.y, u.x, u.y) < dist(a.x, a.y, u.x, u.y) ? f : a));
    u.order = { type: 'attack', target: t.id };
    return;
  }
  // 성 안으로 들어갈 길이 있으면 본성/적 공격.
  // 본성 칸에 적이 서 있으면 그 칸 자체는 갈 수 없으므로 "본성 옆 칸"까지 길이 있는지 본다
  const keeper = foes.find((f) => f.x === b.keep.x && f.y === b.keep.y);
  if (canReach(b, u, (x, y) => (keeper ? dist(x, y, b.keep.x, b.keep.y) <= 1 : x === b.keep.x && y === b.keep.y))) {
    if (dist(nearest.x, nearest.y, u.x, u.y) <= 2) u.order = { type: 'attack', target: nearest.id };
    else if (keeper) u.order = { type: 'attack', target: keeper.id };
    else u.order = { type: 'move', x: b.keep.x, y: b.keep.y };
    return;
  }
  // 궁병은 성벽 위 수비군을 쏜다: 사거리 안이면 쏘고, 아니면 가장 가까운 성벽 위 적에게 다가가 쏜다
  if (u.kind === 'archer') {
    const r = attackRange(b, u);
    const inRange = foes.filter((f) => dist(f.x, f.y, u.x, u.y) <= r).sort((p, q) => p.troops - q.troops)[0];
    if (inRange) {
      u.order = { type: 'attack', target: inRange.id };
      return;
    }
    const onWall = foes.filter((f) => {
      const t = tileAt(b, f.x, f.y)!.t;
      return t === 'wall' || t === 'gate';
    });
    if (onWall.length) {
      const t = onWall.reduce((a, f) => (dist(f.x, f.y, u.x, u.y) < dist(a.x, a.y, u.x, u.y) ? f : a));
      u.order = { type: 'attack', target: t.id };
      return;
    }
  }
  // 공성: 성문만 기다리지 않고 성문·성벽에 나눠 붙는다.
  // 한 곳에 이미 붙은 아군이 많을수록 다른 곳을 고른다 (성문은 붙을 자리가 적어서 나머지는 사다리로 성벽을 친다)
  const assigned = new Map<number, number>();
  for (const a of activeUnits(b, u.side)) {
    if (a === u || a.order.type !== 'siege') continue;
    const k = a.order.y * b.w + a.order.x;
    assigned.set(k, (assigned.get(k) ?? 0) + 1);
  }
  const cur = u.order.type === 'siege' ? u.order.y * b.w + u.order.x : -1;
  let best: { x: number; y: number; score: number } | null = null;
  for (let y = 0; y < b.h; y++)
    for (let x = 0; x < b.w; x++) {
      const t = tileAt(b, x, y)!;
      if (t.t !== 'gate' && t.t !== 'wall') continue;
      // 바깥쪽에 붙을 빈 자리가 있는 곳만 (성 안쪽 칸은 제외)
      let room = 0;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          const nt = tileAt(b, nx, ny);
          if (!nt || inCastle(nx, ny) || !passable(b, u, nx, ny)) continue;
          const occ = unitAt(b, nx, ny);
          if (!occ || occ === u) room++;
        }
      if (!room) continue;
      const k = y * b.w + x;
      // 충차대는 성문만 노린다
      const score = dist(x, y, u.x, u.y) + (t.t === 'gate' ? (u.ram ? -4 : 0) : u.ram ? 8 : 2) + (t.hp ?? 0) / 600 + (assigned.get(k) ?? 0) * 5 - (k === cur ? 2 : 0);
      if (!best || score < best.score) best = { x, y, score };
    }
  if (best) u.order = { type: 'siege', x: best.x, y: best.y };
}

export function decideDefender(b: BattleState, u: BUnit, foes: BUnit[], nearest: BUnit): void {
  const mine = activeUnits(b, 'def');
  const strong = power(mine) > power(foes) * 1.6;
  const nd = dist(nearest.x, nearest.y, u.x, u.y);
  if (strong && b.day >= 2) {
    u.order = { type: 'attack', target: nearest.id };
    return;
  }
  if (u.kind === 'archer') {
    // 성벽 위로 올라가 사격
    const t = tileAt(b, u.x, u.y)!.t;
    if (t !== 'wall' && t !== 'gate') {
      let spot: { x: number; y: number } | null = null;
      for (const [x, y] of [
        [16, 7], [16, 9], [18, 5], [20, 5], [18, 11], [20, 11], [16, 6], [16, 10],
      ] as const) {
        const tt = tileAt(b, x, y)!;
        if ((tt.t === 'wall' || tt.t === 'gate') && !activeUnits(b).some((o) => o.x === x && o.y === y)) {
          spot = { x, y };
          break;
        }
      }
      if (spot) {
        u.order = { type: 'move', x: spot.x, y: spot.y };
        return;
      }
    }
    u.order = { type: 'hold' };
    return;
  }
  // 근접 부대: 성 안이나 성문 근처로 들어온 적을 친다
  if (nd <= 3 || inCastle(nearest.x, nearest.y)) u.order = { type: 'attack', target: nearest.id };
  else if (dist(u.x, u.y, b.keep.x, b.keep.y) > 3) u.order = { type: 'move', x: b.keep.x, y: b.keep.y };
  else u.order = { type: 'hold' };
}

/** 양쪽 모두 AI로 끝까지 진행 */
export function autoResolve(b: BattleState, step: (b: BattleState) => void): void {
  let guard = 0;
  while (!b.result && guard++ < 2000) {
    battleAi(b, ['atk', 'def']);
    step(b);
  }
}
