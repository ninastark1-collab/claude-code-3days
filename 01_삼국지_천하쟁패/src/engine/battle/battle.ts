import { josa } from '../josa';
import { base, cname, type Game } from '../ctx';
import { Rng } from '../rng';
import type { BattleSetup } from '../state';
import { officersIn } from '../world';
import { planDamageMult } from './plan';
import { RAM, assignAllAutoKinds } from './kinds';
import {
  TICKS_PER_DAY,
  type BUnit,
  type BattleState,
  type Cinematic,
  type DuelLog,
  type Order,
  type Side,
  type Terrain,
  type Tile,
  type UnitKind,
} from './types';

export const W = 24;
export const H = 16;
const ATK_INTERVAL = 3;
/**
 * 부대끼리 싸울 때 한 번에 깎이는 병력 배율 (v2 설계서 10-1: 결전 평균 10~18일).
 * 양쪽에 똑같이 걸리는 전투 속도 조절값이라 상성·방침 보정과는 무관하다.
 */
export const COMBAT_PACE = 0.75;
const TAC_COOLDOWN = 36;
/** 혼란이 풀린 뒤 면역 시간 (1일) */
const CONFUSE_IMMUNE = 12;

// ───────────────────────────── 전장 생성 ─────────────────────────────

export function createBattle(
  g: Game,
  setup: BattleSetup,
  playerSide: Side | null,
  kinds: Record<string, UnitKind> = {},
): BattleState {
  const seed = g.rng.int(1, 2 ** 30);
  const holder = { rngState: seed };
  const rng = new Rng(holder);
  const cityB = g.ix.city.get(setup.city)!;
  const city = g.s.cities[setup.city]!;
  const tiles: Tile[] = Array.from({ length: W * H }, () => ({ t: 'plain' as Terrain }));
  const set = (x: number, y: number, t: Terrain, hp?: number) => {
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    tiles[y * W + x] = hp === undefined ? { t } : { t, hp };
  };

  // 지형: 도시 지형에 따라 숲/산/강/물 배치
  const blobs = (t: Terrain, count: number, size: number) => {
    for (let i = 0; i < count; i++) {
      let x = rng.int(3, 15);
      let y = rng.int(0, H - 1);
      for (let k = 0; k < size; k++) {
        set(x, y, t);
        x += rng.int(-1, 1);
        y += rng.int(-1, 1);
      }
    }
  };
  const terr = cityB.terrain;
  blobs('forest', terr === 'mountain' ? 4 : 3, 7);
  blobs('mountain', terr === 'mountain' ? 5 : terr === 'frontier' ? 2 : 1, 6);
  if (terr === 'river' || terr === 'coast') {
    const rx = rng.int(8, 12);
    for (let y = 0; y < H; y++) {
      const x = rx + (y % 5 === 0 ? 1 : 0);
      set(x, y, 'river');
      set(x + 1, y, 'river');
    }
    for (const by of [rng.int(2, 5), rng.int(10, 13)]) {
      set(rx, by, 'bridge');
      set(rx + 1, by, 'bridge');
      set(rx + 1, by + (by % 5 === 0 ? 0 : 0), 'bridge');
    }
  }
  if (terr === 'coast') for (let x = 0; x < W; x++) set(x, 0, 'water');

  // 성: 본성 (19,8), 성벽 고리 (17..21 × 5..11)
  const kx = 19;
  const ky = 8;
  const wallHp = Math.max(300, city.walls * 3);
  const gateHp = Math.max(150, Math.round(city.walls * 1.5));
  for (let x = 16; x <= 22; x++)
    for (let y = 5; y <= 11; y++) {
      const edge = x === 16 || x === 22 || y === 5 || y === 11;
      if (edge) set(x, y, 'wall', wallHp);
      else set(x, y, 'town');
    }
  set(16, 8, 'gate', gateHp);
  set(19, 5, 'gate', gateHp);
  set(19, 11, 'gate', gateHp);
  set(kx, ky, 'keep');
  // 성 바깥 동쪽 여유 공간은 평지로
  for (let y = 0; y < H; y++) set(23, y, 'plain');

  const unitFor = (officer: string, troops: number, side: Side, x: number, y: number, faction: string | null): BUnit => {
    const b = base(g, officer);
    const os = g.s.officers[officer]!;
    // 병과: 직접 고른 값, 아니면 자동 (특기 우선, 비율 배정은 kinds.ts assignAutoKinds)
    const kind: UnitKind = kinds[officer] ?? (b.skills.includes('cavalry') ? 'cavalry' : b.skills.includes('archery') ? 'archer' : 'infantry');
    return {
      id: `${side}_${officer}`,
      officer,
      name: b.name,
      side,
      faction,
      kind,
      troops,
      startTroops: troops,
      training: os.training,
      morale: 70 + Math.round(os.training / 5),
      x,
      y,
      mp: 0,
      atkCd: 0,
      tacCd: 12,
      confused: 0,
      order: { type: 'hold' },
      status: 'active',
      lea: b.leadership,
      war: b.war,
      int: b.intelligence,
      cha: b.charisma,
      skills: b.skills,
      autoKind: !kinds[officer],
    };
  };

  const units: BUnit[] = [];
  const atkSpots = [
    [2, 8], [2, 6], [2, 10], [1, 7], [1, 9],
  ];
  setup.units.forEach((u, i) => {
    const [x, y] = atkSpots[i]!;
    set(x!, y!, 'plain');
    units.push(unitFor(u.officer, u.troops, 'atk', x!, y!, setup.attacker));
  });
  // 동맹 협공 원군: 공격군 양 날개 끝에 선다
  const allySpots = [
    [1, 4], [1, 12], [3, 4], [3, 12],
  ];
  (setup.allies ?? []).forEach((a, i) => {
    const [x, y] = allySpots[i]!;
    set(x!, y!, 'plain');
    units.push(unitFor(a.officer, a.troops, 'atk', x!, y!, a.faction));
  });

  const defenders = officersIn(g, setup.city, city.faction)
    .filter((o) => o.troops > 0)
    .sort((a, b) => b.troops - a.troops)
    .slice(0, 10);
  const defSpots = [
    [kx, ky], [18, 8], [20, 8], [19, 7], [19, 9], [18, 7], [20, 9], [18, 9], [20, 7], [17, 8],
  ];
  defenders.forEach((o, i) => {
    const [x, y] = defSpots[i]!;
    units.push(unitFor(o.id, o.troops, 'def', x!, y!, city.faction));
  });

  const southeastWind =
    g.s.flags.southeastWind === g.s.year && g.s.month >= 10 && (terr === 'river' || terr === 'coast');

  const bs: BattleState = {
    setup,
    w: W,
    h: H,
    tiles,
    units,
    tick: 0,
    day: 1,
    maxDays: 30,
    weather: 'clear',
    wind: southeastWind ? [-1, -1] : [rng.int(-1, 1), rng.int(-1, 1)],
    atkFood: setup.food,
    defFood: city.food,
    keep: { x: kx, y: ky },
    playerSide,
    rngState: holder.rngState,
    fireBoost: southeastWind,
    log: [`${cname(g, setup.city)} 전투 개시`],
    duels: [],
    cityName: cname(g, setup.city),
    leaders: { atk: setup.units[0]?.officer, def: city.governor ?? defenders[0]?.id },
  };
  // 자동 병과: 작전 전에는 공성·농성으로 본다 (작전이 정해지면 auto.ts 가 다시 맞춘다)
  assignAllAutoKinds(bs);
  return bs;
}

// ───────────────────────────── 기본 도구 ─────────────────────────────

export const tileAt = (b: BattleState, x: number, y: number): Tile | undefined =>
  x < 0 || y < 0 || x >= b.w || y >= b.h ? undefined : b.tiles[y * b.w + x];

export const dist = (ax: number, ay: number, bx: number, by: number) => Math.max(Math.abs(ax - bx), Math.abs(ay - by));

export const unitAt = (b: BattleState, x: number, y: number) =>
  b.units.find((u) => u.status === 'active' && u.x === x && u.y === y);

export const activeUnits = (b: BattleState, side?: Side) =>
  b.units.filter((u) => u.status === 'active' && (side === undefined || u.side === side));

export function rngOf(b: BattleState): Rng {
  return new Rng(b);
}

/** 이 부대가 그 칸에 들어갈 수 있는지 (지형만 본다) */
export function passable(b: BattleState, u: BUnit, x: number, y: number): boolean {
  const t = tileAt(b, x, y);
  return !!t && moveCost(t, u) !== Infinity;
}

function moveCost(t: Tile, u: BUnit): number {
  switch (t.t) {
    case 'plain':
    case 'town':
    case 'keep':
    case 'bridge':
      return 1;
    case 'forest':
      return u.kind === 'cavalry' ? 3 : 2;
    case 'mountain':
      return u.kind === 'cavalry' ? 4.5 : 3;
    case 'river':
      return u.skills.includes('navy') ? 1.5 : 3.5;
    case 'water':
      return Infinity;
    case 'wall':
    case 'gate':
      return u.side === 'def' ? 1.5 : Infinity;
  }
}

export function attackRange(b: BattleState, u: BUnit): number {
  if (u.kind !== 'archer') return 1;
  const t = tileAt(b, u.x, u.y)!.t;
  return t === 'wall' || t === 'gate' || t === 'mountain' ? 3 : 2;
}

const SPEED: Record<UnitKind, number> = { infantry: 0.34, cavalry: 0.5, archer: 0.3 };

/** 다익스트라: goal(x,y)=true 인 칸 중 가장 가까운 곳으로 가는 첫 걸음 */
function nextStep(b: BattleState, u: BUnit, isGoal: (x: number, y: number) => boolean): { x: number; y: number } | null {
  const n = b.w * b.h;
  const d = new Float64Array(n).fill(Infinity);
  const prev = new Int32Array(n).fill(-1);
  const done = new Uint8Array(n);
  const start = u.y * b.w + u.x;
  d[start] = 0;
  // 이진 힙: 넣을 때의 거리를 함께 저장 (나중에 d가 줄어도 힙 순서가 깨지지 않게, 오래된 항목은 done으로 건너뜀)
  const heap: [number, number][] = [[0, start]];
  const swap = (a: number, c: number) => ([heap[a], heap[c]] = [heap[c]!, heap[a]!]);
  const push = (i: number) => {
    heap.push([d[i]!, i]);
    let k = heap.length - 1;
    while (k > 0) {
      const p = (k - 1) >> 1;
      if (heap[p]![0] <= heap[k]![0]) break;
      swap(p, k);
      k = p;
    }
  };
  const pop = (): number => {
    const top = heap[0]![1];
    const last = heap.pop()!;
    if (heap.length) {
      heap[0] = last;
      let k = 0;
      for (;;) {
        const l = 2 * k + 1;
        const r = l + 1;
        let m = k;
        if (l < heap.length && heap[l]![0] < heap[m]![0]) m = l;
        if (r < heap.length && heap[r]![0] < heap[m]![0]) m = r;
        if (m === k) break;
        swap(m, k);
        k = m;
      }
    }
    return top;
  };
  for (;;) {
    if (!heap.length) return null;
    const cur = pop();
    if (done[cur]) continue;
    done[cur] = 1;
    const cx = cur % b.w;
    const cy = (cur / b.w) | 0;
    if (cur !== start && isGoal(cx, cy)) {
      let step = cur;
      while (prev[step] !== start) step = prev[step]!;
      return { x: step % b.w, y: (step / b.w) | 0 };
    }
    if (cur === start && isGoal(cx, cy)) return null;
    for (let dx = -1; dx <= 1; dx++)
      for (let dy = -1; dy <= 1; dy++) {
        if (!dx && !dy) continue;
        const nx = cx + dx;
        const ny = cy + dy;
        const t = tileAt(b, nx, ny);
        if (!t) continue;
        const c = moveCost(t, u);
        if (c === Infinity) continue;
        const occ = unitAt(b, nx, ny);
        let extra = 0;
        if (occ && occ !== u) {
          if (occ.side !== u.side) continue;
          extra = 3; // 아군이 있는 칸은 돌아가도록
        }
        const ni = ny * b.w + nx;
        const nd = d[cur]! + c + extra + (dx && dy ? 0.01 : 0);
        if (nd < d[ni]!) {
          d[ni] = nd;
          prev[ni] = cur;
          push(ni);
        }
      }
  }
}

/** 목표에 도달할 수 있는 경로가 있는지 */
export function canReach(b: BattleState, u: BUnit, isGoal: (x: number, y: number) => boolean): boolean {
  return isGoal(u.x, u.y) || nextStep(b, u, isGoal) !== null;
}

/** 목표 쪽으로 이동 시도. 이동했으면 true */
function tryMove(b: BattleState, u: BUnit, isGoal: (x: number, y: number) => boolean): boolean {
  u.mp = Math.min(u.mp + SPEED[u.kind] * (u.ram ? RAM.speed : 1), 5);
  if (u.mp < 1) return true; // 아직 한 칸도 못 감 (경로 계산 생략)
  const step = nextStep(b, u, isGoal);
  if (!step) return false;
  const t = tileAt(b, step.x, step.y)!;
  const cost = moveCost(t, u);
  if (u.mp < cost) return true;
  if (unitAt(b, step.x, step.y)) {
    u.mp = Math.min(u.mp, cost);
    return true; // 막혀 있으면 대기
  }
  u.mp -= cost;
  u.x = step.x;
  u.y = step.y;
  return true;
}

// ───────────────────────────── 전투 계산 ─────────────────────────────

/** 병종 상성 (설계노트 37장 확정판): 공격하는 쪽 → 맞는 쪽 배율. 모든 병종에 강점 1, 약점 1 */
export const KIND_MULT: Record<UnitKind, Record<UnitKind, number>> = {
  infantry: { infantry: 1, cavalry: 1.3, archer: 0.8 }, // 창병: 기병에 강함, 궁병에 약함
  cavalry: { infantry: 0.8, cavalry: 1, archer: 1.3 }, // 기병: 궁병에 강함, 창병에 약함
  archer: { infantry: 1.3, cavalry: 0.8, archer: 1 }, // 궁병: 창병에 강함, 기병에 약함
};
const TERRAIN_DEF: Partial<Record<Terrain, number>> = {
  forest: 0.85,
  mountain: 0.75,
  wall: 0.55,
  gate: 0.6,
  keep: 0.7,
  town: 0.85,
  river: 1.2,
};

function damage(b: BattleState, a: BUnit, d: BUnit, mult: number, rng: Rng): number {
  return Math.round(baseDamage(b, a, d, mult) * (0.85 + rng.next() * 0.3));
}

/** 공격 예상치 (B4): 무작위 편차 없이 계산한 피해와, 근접일 때 받을 반격 피해 */
export function previewDamage(b: BattleState, a: BUnit, d: BUnit): { dealt: number; counter: number; inRange: boolean } {
  const dealt = Math.min(d.troops, Math.round(baseDamage(b, a, d, 1)));
  const melee = dist(a.x, a.y, d.x, d.y) <= 1 || a.kind !== 'archer';
  const counter = melee && d.confused === 0 ? Math.round(baseDamage(b, d, a, d.kind === 'archer' ? 0.35 : 0.5)) : 0;
  return { dealt, counter, inRange: dist(a.x, a.y, d.x, d.y) <= attackRange(b, a) };
}

function baseDamage(b: BattleState, a: BUnit, d: BUnit, mult: number): number {
  const atkStat = a.kind === 'archer' ? a.lea * 0.5 + a.war * 0.3 + a.int * 0.2 : a.lea * 0.45 + a.war * 0.55;
  const defStat = d.lea * 0.6 + d.int * 0.2 + d.war * 0.2;
  let m = Math.pow(atkStat / Math.max(20, defStat), 1.2);
  m *= KIND_MULT[a.kind][d.kind];
  m *= 0.6 + a.training / 250;
  m *= 0.5 + a.morale / 200;
  const at = tileAt(b, a.x, a.y)!.t;
  const dt = tileAt(b, d.x, d.y)!.t;
  m *= TERRAIN_DEF[dt] ?? 1;
  if (at === 'river' && !a.skills.includes('navy')) m *= 0.7;
  if (a.kind === 'cavalry' && (at === 'forest' || at === 'mountain')) m *= 0.75;
  if (a.kind === 'cavalry' && a.skills.includes('cavalry')) m *= 1.2;
  if (a.kind === 'archer' && a.skills.includes('archery')) m *= 1.2;
  if (a.skills.includes('ambush') && (at === 'forest' || at === 'mountain')) m *= 1.25;
  if (a.confused) m *= 0.5;
  m *= planDamageMult(b, a, d);
  return (40 + a.troops * 0.025) * m * mult * COMBAT_PACE;
}

function applyLoss(b: BattleState, u: BUnit, loss: number, rng: Rng, by?: BUnit): void {
  if (u.status !== 'active') return;
  loss = Math.min(loss, u.troops);
  u.troops -= loss;
  if (by) by.dealt = (by.dealt ?? 0) + loss;
  u.morale = Math.max(0, u.morale - (loss / Math.max(1, u.troops + loss)) * 40);
  if (u.troops <= 0 || u.morale <= 5) defeatUnit(b, u, rng, by);
}

/** 관전 연출 큐에 넣는다 */
export function pushCinematic(b: BattleState, c: Cinematic): void {
  (b.cinematics ??= []).push(c);
  // 결과만 보기·AI 전투처럼 아무도 꺼내지 않는 경우 무한히 쌓이지 않게
  if (b.cinematics.length > 40) b.cinematics.splice(0, b.cinematics.length - 40);
}
const isCommander = (b: BattleState, u: BUnit) => b.plans?.[u.side]?.commander === u.id;

function defeatUnit(b: BattleState, u: BUnit, rng: Rng, by?: BUnit): void {
  const enemiesNear = activeUnits(b, u.side === 'atk' ? 'def' : 'atk').filter((e) => dist(e.x, e.y, u.x, u.y) <= 1).length;
  const pCapture = Math.max(5, Math.min(80, 30 + enemiesNear * 10 - u.war / 4 + (u.troops <= 0 ? 15 : 0)));
  if (rng.chance(3)) {
    u.status = 'dead';
    b.log.push(`${u.name} 전사!`);
    pushCinematic(b, { kind: 'banner', text: `${u.name}, 전장에 지다`, tone: 'loss', side: u.side, x: u.x, y: u.y });
  } else if (rng.chance(pCapture)) {
    u.status = 'captured';
    b.log.push(`${josa(u.name, '이/가')} ${by ? by.name + '에게 ' : ''}사로잡혔다!`);
    pushCinematic(b, { kind: 'banner', text: `${josa(u.name, '이/가')} 사로잡혔다!`, tone: 'loss', side: u.side, x: u.x, y: u.y });
  } else {
    u.status = 'routed';
    b.log.push(`${u.name} 부대 패주`);
    if (isCommander(b, u)) pushCinematic(b, { kind: 'banner', text: `총대장 ${u.name}의 부대가 무너진다!`, tone: 'loss', side: u.side, x: u.x, y: u.y });
  }
}

/**
 * 맞붙을 수 있는 전면은 한정된다: 한 부대에 근접으로 붙은 적이 FRONTAGE 개를 넘으면
 * 넘는 만큼 한 부대당 피해가 줄어, 합계가 FRONTAGE 부대 몫을 넘지 않는다 (대군이 소부대를 순식간에 녹이지 않게 — 관전 템포)
 */
export const FRONTAGE = 2.5;
export function crowdFactor(b: BattleState, a: BUnit, d: BUnit): number {
  if (dist(a.x, a.y, d.x, d.y) > 1) return 1; // 원거리 사격은 제한 없음
  const n = activeUnits(b, a.side).filter((e) => dist(e.x, e.y, d.x, d.y) <= 1).length;
  return n > FRONTAGE ? FRONTAGE / n : 1;
}

/** 한 번 공격으로 줄 수 있는 피해 상한: 맞는 부대 출진 병력의 이 비율 (압도적 병력 차에도 한두 합에 녹지 않게 — 관전 템포) */
export const HIT_CAP = 0.08;

function attackUnit(b: BattleState, a: BUnit, d: BUnit, rng: Rng): void {
  b.firstClash ??= b.tick;
  const onWall = a.kind === 'archer' && tileAt(b, a.x, a.y)?.t === 'wall';
  const mult = crowdFactor(b, a, d) * (d.ram && onWall ? RAM.hurtByWallArcher : 1);
  const dmg = Math.min(damage(b, a, d, mult, rng), Math.ceil(d.startTroops * HIT_CAP * (d.ram && onWall ? RAM.hurtByWallArcher : 1)));
  applyLoss(b, d, dmg, rng, a);
  a.morale = Math.min(100, a.morale + 0.5);
  // 근접 공격이면 반격
  if (d.status === 'active' && dist(a.x, a.y, d.x, d.y) <= 1 && d.confused === 0) {
    const back = damage(b, d, a, d.kind === 'archer' ? 0.35 : 0.5, rng);
    applyLoss(b, a, back, rng, d);
  }
  a.atkCd = ATK_INTERVAL;
}

function attackTile(b: BattleState, a: BUnit, x: number, y: number, rng: Rng): void {
  const t = tileAt(b, x, y);
  if (!t || (t.t !== 'wall' && t.t !== 'gate')) return;
  let dmg = (40 + a.troops * 0.025) * (a.lea * 0.5 + a.war * 0.5) / 70 * 0.35 * (0.85 + rng.next() * 0.3);
  if (a.skills.includes('siege')) dmg *= 2;
  if (a.kind === 'archer') dmg *= 0.3;
  if (t.t === 'gate') dmg *= 1.3 * (a.ram ? RAM.gate : 1);
  t.hp = (t.hp ?? 0) - Math.round(dmg);
  a.atkCd = ATK_INTERVAL;
  // 성벽 위 수비대의 반격 (궁병이 성벽에 있으면 더 아픔)
  if (t.hp <= 0) {
    b.log.push(`${t.t === 'gate' ? '성문' : '성벽'}이 무너졌다! (${a.name})`);
    pushCinematic(b, { kind: 'banner', text: t.t === 'gate' ? '성문이 열렸다!' : '성벽이 무너졌다!', tone: 'neutral', side: a.side, x, y });
    tiles(b)[y * b.w + x] = { t: 'plain' };
  }
}

const tiles = (b: BattleState) => b.tiles;

// ───────────────────────────── 계략 / 일기토 ─────────────────────────────

export type TacticKind = 'fire' | 'confuse' | 'inspire';

export function tacticChance(b: BattleState, u: BUnit, kind: TacticKind, target?: BUnit): number {
  if (kind === 'fire') {
    if (b.weather === 'rain') return 0;
    let p = 30 + u.int * 0.4 + (u.skills.includes('fire') ? 25 : 0) - (target ? target.int * 0.25 : 0);
    if (b.weather === 'cloudy') p -= 10;
    if (b.fireBoost) p += 25;
    return Math.max(0, Math.min(95, Math.round(p)));
  }
  if (kind === 'confuse') {
    if (!target) return 0;
    const p = 35 + (u.int - target.int) * 0.9 + (u.skills.includes('ambush') ? 10 : 0);
    return Math.max(5, Math.min(90, Math.round(p)));
  }
  return Math.max(10, Math.min(95, Math.round(35 + u.cha * 0.4 + (u.skills.includes('inspire') ? 30 : 0))));
}

/** 계략 실행. 실패 사유가 있으면 문자열 반환 */
export function applyTactic(b: BattleState, u: BUnit, kind: TacticKind, tx: number, ty: number): string | null {
  if (u.status !== 'active') return '행동할 수 없는 부대입니다.';
  if (u.confused) return '혼란 상태입니다.';
  if (u.tacCd > 0) return `계략 준비 중 (${Math.ceil(u.tacCd / TICKS_PER_DAY * 10) / 10}일)`;
  const rng = rngOf(b);
  if (kind === 'inspire') {
    u.tacCd = TAC_COOLDOWN;
    if (!rng.chance(tacticChance(b, u, 'inspire'))) {
      b.log.push(`${u.name}의 고무 실패`);
      return null;
    }
    for (const a of activeUnits(b, u.side)) {
      if (dist(a.x, a.y, u.x, u.y) <= 1) {
        a.confused = 0;
        a.morale = Math.min(100, a.morale + 25);
      }
    }
    b.log.push(`${josa(u.name, '이/가')} 병사들을 고무했다!`);
    return null;
  }
  if (dist(u.x, u.y, tx, ty) > 3) return '사정거리(3칸) 밖입니다.';
  const target = unitAt(b, tx, ty);
  if (kind === 'confuse') {
    if (!target || target.side === u.side) return '적 부대를 지정하세요.';
    if (target.confused > 0) return '이미 혼란 상태인 부대입니다.';
    if ((target.confImmune ?? 0) > 0) return `${target.name} 부대는 막 혼란에서 벗어나 경계 중입니다 (면역).`;
    u.tacCd = TAC_COOLDOWN;
    if (rng.chance(tacticChance(b, u, 'confuse', target))) {
      target.confused = 24;
      b.log.push(`${u.name}의 계략! ${target.name} 부대가 혼란에 빠졌다.`);
    } else b.log.push(`${josa(target.name, '이/가')} ${u.name}의 계략을 간파했다.`);
    return null;
  }
  const t = tileAt(b, tx, ty)!;
  if (t.t === 'water' || t.t === 'river') return '물 위에는 불을 놓을 수 없습니다.';
  u.tacCd = TAC_COOLDOWN;
  if (rng.chance(tacticChance(b, u, 'fire', target && target.side !== u.side ? target : undefined))) {
    t.fire = (t.t === 'forest' ? 30 : 18) * (b.fireBoost ? 1.5 : 1);
    b.log.push(`${u.name}의 화계! 불길이 치솟는다.`);
    pushCinematic(b, { kind: 'banner', text: `화공! ${u.name}의 불길이 치솟는다`, tone: 'stratagem', side: u.side, x: tx, y: ty });
  } else b.log.push(`${u.name}의 화계 실패`);
  return null;
}

/** 일기토 수락 확률 (%) — B3: 신청 전에 화면에 표시 */
export function duelAcceptChance(b: BattleState, challenger: BUnit, target: BUnit): number {
  if (target.dueled || challenger.dueled) return 0;
  if (target.war + 5 >= challenger.war) return 100;
  // 플레이어 장수는 승산 없는 일기토를 무작위로 받지 않는다 (AI만 객기로 받아줌)
  if (target.side === b.playerSide) return 0;
  return 20;
}

/** 일기토 수락 여부 (AI 쪽 판단) */
export function duelAccepted(b: BattleState, challenger: BUnit, target: BUnit): boolean {
  const p = duelAcceptChance(b, challenger, target);
  if (p >= 100) return true;
  if (p <= 0) return false;
  return rngOf(b).chance(p);
}

/** 일기토 실행. 결과 로그를 돌려준다 */
export function runDuel(b: BattleState, a: BUnit, d: BUnit, extra: Pick<DuelLog, 'lineA' | 'lineB' | 'source'> = {}): DuelLog {
  const rng = rngOf(b);
  a.dueled = true;
  d.dueled = true;
  let ah = 100;
  let dh = 100;
  const rounds: DuelLog['rounds'] = [];
  const hit = (x: BUnit, y: BUnit) => Math.max(0, Math.round(rng.int(0, 12) + (x.war - y.war) / 5 + x.war / 14));
  for (let r = 1; r <= 40 && ah > 0 && dh > 0; r++) {
    const h1 = hit(a, d);
    const h2 = hit(d, a);
    dh -= h1;
    ah -= h2;
    const text =
      h1 > h2 + 4 ? `${a.name}의 일격!` : h2 > h1 + 4 ? `${d.name}의 반격!` : rng.chance(50) ? '서로 칼을 맞부딪친다' : '불꽃 튀는 공방';
    rounds.push({ aHp: Math.max(0, ah), bHp: Math.max(0, dh), text: `${r}합: ${text}` });
  }
  let winner: BUnit | null = null;
  let loser: BUnit | null = null;
  if (ah > 0 && dh <= 0) (winner = a), (loser = d);
  else if (dh > 0 && ah <= 0) (winner = d), (loser = a);
  else if (ah !== dh && rounds.length >= 40) (winner = ah > dh ? a : d), (loser = ah > dh ? d : a);
  let outcome = '승부가 나지 않았다.';
  let fate: DuelLog['fate'] = 'draw';
  if (winner && loser) {
    winner.morale = Math.min(100, winner.morale + 30);
    for (const ally of activeUnits(b, loser.side)) ally.morale = Math.max(0, ally.morale - 8);
    const roll = rng.next();
    if (roll < 0.15) {
      loser.status = 'dead';
      fate = 'dead';
      outcome = `${josa(winner.name, '이/가')} ${josa(loser.name, '을/를')} 베었다!`;
    } else if (roll < 0.5) {
      loser.status = 'captured';
      fate = 'captured';
      outcome = `${josa(winner.name, '이/가')} ${josa(loser.name, '을/를')} 사로잡았다!`;
    } else {
      // 달아난 장수의 부대는 바로 사라지지 않고 병력 절반·사기 저하로 전장 끝까지 물러난다 (추격 장면이 이어짐)
      fate = 'routed';
      loser.troops = Math.round(loser.troops / 2);
      loser.morale = Math.max(10, loser.morale - 25);
      loser.order = { type: 'retreat' };
      outcome = `${josa(loser.name, '이/가')} 말머리를 돌려 달아났다!`;
    }
  }
  const log: DuelLog = {
    a: a.name,
    b: d.name,
    rounds,
    winner: winner?.name ?? null,
    outcome,
    aId: a.officer,
    bId: d.officer,
    aSide: a.side,
    aWar: a.war,
    bWar: d.war,
    aFaction: a.faction,
    bFaction: d.faction,
    fate,
    moraleWin: winner ? 30 : 0,
    moraleLose: winner ? -8 : 0,
    tick: b.tick,
    day: b.day,
    ...extra,
  };
  b.duels.push(log);
  b.log.push(`일기토 ${a.name} vs ${d.name}: ${outcome}`);
  pushCinematic(b, { kind: 'duel', duel: b.duels.length - 1 });
  return log;
}

// ───────────────────────────── 명령 ─────────────────────────────

export function setOrder(b: BattleState, unitId: string, order: Order): void {
  const u = b.units.find((x) => x.id === unitId);
  if (u && u.status === 'active') u.order = order;
}

// ───────────────────────────── 진행 ─────────────────────────────

function enemyInRange(b: BattleState, u: BUnit): BUnit | undefined {
  const r = attackRange(b, u);
  let best: BUnit | undefined;
  for (const e of activeUnits(b, u.side === 'atk' ? 'def' : 'atk')) {
    if (e.hidden) continue;
    const d = dist(e.x, e.y, u.x, u.y);
    if (d <= r && (!best || e.troops < best.troops)) best = e;
  }
  return best;
}

function stepUnit(b: BattleState, u: BUnit, rng: Rng): void {
  if (u.confused > 0) {
    u.confused--;
    if (u.confused === 0) u.confImmune = CONFUSE_IMMUNE;
    // 혼란 중에는 제자리에서 멍하니 있다 (가끔 아군끼리 피해)
    return;
  }
  if (u.atkCd > 0) u.atkCd--;
  const o = u.order;
  const ready = u.atkCd <= 0;

  if (o.type === 'retreat') {
    const edge = u.side === 'atk' ? 0 : b.w - 1;
    if (u.x === edge) {
      u.status = 'retreated';
      b.log.push(`${u.name} 부대 퇴각`);
      if (isCommander(b, u)) pushCinematic(b, { kind: 'banner', text: `총대장 ${u.name}이 전장을 떠난다`, tone: 'loss', side: u.side });
      return;
    }
    if (!tryMove(b, u, (x) => x === edge)) {
      // 퇴로가 모두 막힘: 퇴각 대신 그 자리에서 싸운다 (39장: 결사)
      u.order = { type: 'hold' };
      u.morale = Math.min(100, u.morale + 10);
      b.log.push(`${u.name} 부대: 퇴로가 막혀 결사의 각오로 버틴다!`);
    }
    return;
  }

  if (o.type === 'attack') {
    const t = b.units.find((x) => x.id === o.target);
    if (!t || t.status !== 'active' || t.hidden) {
      u.order = { type: 'hold' };
    } else if (dist(t.x, t.y, u.x, u.y) <= attackRange(b, u)) {
      if (ready) attackUnit(b, u, t, rng);
      return;
    } else {
      const r = attackRange(b, u);
      if (!tryMove(b, u, (x, y) => dist(x, y, t.x, t.y) <= r)) {
        // 길이 막혔으면 가까운 적부터
        const e = enemyInRange(b, u);
        if (e && ready) attackUnit(b, u, e, rng);
      }
      return;
    }
  }

  if (o.type === 'siege') {
    const t = tileAt(b, o.x, o.y);
    if (!t || (t.t !== 'wall' && t.t !== 'gate')) {
      u.order = { type: 'hold' };
    } else if (dist(o.x, o.y, u.x, u.y) <= (u.kind === 'archer' ? 2 : 1)) {
      if (ready) attackTile(b, u, o.x, o.y, rng);
      return;
    } else {
      if (!tryMove(b, u, (x, y) => dist(x, y, o.x, o.y) <= 1)) u.order = { type: 'hold' };
      return;
    }
  }

  if (o.type === 'move') {
    if (u.x === o.x && u.y === o.y) u.order = { type: 'hold' };
    else {
      const moved = tryMove(b, u, (x, y) => x === o.x && y === o.y);
      if (!moved) {
        // 목표 칸에 갈 수 없으면 가장 가까운 칸까지만
        u.order = { type: 'hold' };
      }
      return;
    }
  }

  // hold: 사정거리 안 적을 자동 공격
  const e = enemyInRange(b, u);
  if (e && ready) attackUnit(b, u, e, rng);
}

function stepFire(b: BattleState, rng: Rng): void {
  const burning: number[] = [];
  b.tiles.forEach((t, i) => {
    if (t.fire && t.fire > 0) burning.push(i);
  });
  for (const i of burning) {
    const t = b.tiles[i]!;
    const x = i % b.w;
    const y = (i / b.w) | 0;
    const u = unitAt(b, x, y);
    if (u) {
      applyLoss(b, u, Math.round(u.troops * 0.015 + 30), rng);
      u.morale = Math.max(0, u.morale - 1.5);
    }
    if (t.t === 'gate') {
      t.hp = (t.hp ?? 0) - 15;
      if (t.hp <= 0) b.tiles[i] = { t: 'plain', fire: t.fire };
    }
    // 번짐
    for (let dx = -1; dx <= 1; dx++)
      for (let dy = -1; dy <= 1; dy++) {
        if (!dx && !dy) continue;
        const n = tileAt(b, x + dx, y + dy);
        if (!n || n.fire || n.t === 'water' || n.t === 'river' || n.t === 'bridge') continue;
        let p = n.t === 'forest' ? 0.06 : n.t === 'town' ? 0.04 : 0.015;
        if (dx === b.wind[0] && dy === b.wind[1]) p *= 3;
        if (b.fireBoost) p *= 2;
        if (b.weather === 'rain') p *= 0.2;
        if (rng.next() < p) n.fire = n.t === 'forest' ? 24 : 12;
      }
    t.fire = (t.fire ?? 0) - (b.weather === 'rain' ? 3 : 1);
    if (t.fire <= 0) delete t.fire;
  }
}

function newDay(b: BattleState, rng: Rng): void {
  b.day++;
  const atkTroops = activeUnits(b, 'atk').reduce((s, u) => s + u.troops, 0);
  const defTroops = activeUnits(b, 'def').reduce((s, u) => s + u.troops, 0);
  // 지연전(작전 자동 전투): 시간을 끌수록 공격군 보급 부담이 커진다
  const atkUse = b.started && b.plans?.def?.policy === 'def_delay' ? 1.3 : 1;
  b.atkFood = Math.max(0, b.atkFood - Math.ceil((atkTroops / 100) * atkUse));
  b.defFood = Math.max(0, b.defFood - Math.ceil(defTroops / 100));
  if (b.defFood <= 0) {
    // 군량이 떨어진 수비군은 사기가 무너지면 흩어진다
    for (const u of activeUnits(b, 'def')) {
      u.morale = Math.max(0, u.morale - 5);
      if (u.morale <= 5) {
        u.status = 'routed';
        b.log.push(`${u.name} 부대가 굶주림을 못 이기고 흩어졌다`);
      }
    }
  }
  if (b.atkFood <= Math.ceil(atkTroops / 100) * 2 && b.atkFood > 0) b.log.push('공격군의 군량이 바닥나고 있다!');
  const r = rng.next();
  b.weather = r < 0.5 ? 'clear' : r < 0.8 ? 'cloudy' : 'rain';
  if (!b.fireBoost && rng.chance(30)) b.wind = [rng.int(-1, 1), rng.int(-1, 1)];
  for (const u of activeUnits(b)) u.morale = Math.min(100, u.morale + 1);
}

function checkEnd(b: BattleState): void {
  if (b.result) return;
  const atk = activeUnits(b, 'atk');
  const def = activeUnits(b, 'def');
  let winner: Side | null = null;
  let reason = '';
  if (atk.some((u) => u.x === b.keep.x && u.y === b.keep.y)) (winner = 'atk'), (reason = '본성 점령');
  else if (atk.length === 0) (winner = 'def'), (reason = '공격군 전멸·퇴각');
  else if (def.length === 0) (winner = 'atk'), (reason = '수비군 전멸');
  else if (b.atkFood <= 0) (winner = 'def'), (reason = '공격군 군량 소진');
  else if (b.day > b.maxDays) (winner = 'def'), (reason = '30일 경과');
  if (!winner) return;
  // 남은 패자 부대는 퇴각 처리
  for (const u of activeUnits(b, winner === 'atk' ? 'def' : 'atk')) u.status = 'retreated';
  b.result = {
    winner,
    reason,
    units: b.units.map((u) => ({ officer: u.officer, side: u.side, troops: u.troops, status: u.status })),
    atkFoodLeft: b.atkFood,
  };
  b.log.push(`${winner === 'atk' ? '공격군' : '수비군'} 승리 (${reason})`);
}

/** 1틱 진행 */
export function stepBattle(b: BattleState): void {
  if (b.result) return;
  const rng = rngOf(b);
  b.tick++;
  for (const u of b.units) {
    if (u.status !== 'active') continue;
    if (u.tacCd > 0) u.tacCd--;
    if (u.confImmune) u.confImmune--;
    if (u.ambushTicks) u.ambushTicks--;
  }
  // 공격 순서 섞기 (먼저 움직이는 쪽 이득 방지)
  const order = rng.shuffle(activeUnits(b));
  for (const u of order) if (u.status === 'active') stepUnit(b, u, rng);
  stepFire(b, rng);
  if (b.tick % TICKS_PER_DAY === 0) newDay(b, rng);
  checkEnd(b);
}

/** 퇴각 가능한지 (공격군은 서쪽 끝, 수비군은 동쪽 끝으로 빠져나감) */
export function retreatAll(b: BattleState, side: Side): void {
  for (const u of activeUnits(b, side)) u.order = { type: 'retreat' };
}

/** 전체 퇴각 즉시 처리 (플레이어가 전투 포기) */
export function surrenderBattle(b: BattleState, side: Side): void {
  for (const u of activeUnits(b, side)) u.status = 'retreated';
  checkEnd(b);
}
