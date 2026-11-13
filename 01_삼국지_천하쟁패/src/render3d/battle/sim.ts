/**
 * 엔진 전투 결과 재생 (보여 주기 전용). 승패·피해·위치는 언제나 엔진 값이고, 여기서는 그 값을 병사 움직임으로 옮긴다.
 *
 * 대열 (디자인 수정 1): 병사마다 대열 칸(가로 col, 줄 row)이 정해져 있고 교전 중에도 그 칸을 지킨다.
 * - 맞붙는 건 앞줄: 칸에서 최대 0.75 앞으로 나와 2.6 안의 적과 싸운다. 뒷줄은 창을 겨눈 채 대기
 * - 앞줄이 쓰러지면 같은 줄(세로) 뒤 병사가 한 칸씩 당겨져 메운다 → 병력이 줄면 대열이 뒤에서부터 얇아진다
 * - 장수는 전선 바로 앞에서 싸우고 4.5 넘게 떨어진 적은 쫓지 않는다
 * - 이기는 쪽(병력×사기 비율)이 전선을 조금씩 밀고 나간다
 * - 맞고 버틴 병사는 뒤로 살짝 튕겼다가 제자리로 돌아온다
 * - 피해: 병사 1명 = per 명 (기본 100명). 엔진 병력이 줄어든 만큼 앞줄부터 쓰러지고 45초 남는다
 *
 * 지형 (디자인 수정 3): 물(깊은 물)·서 있는 성벽·전장 밖으로는 못 간다. 성벽 위 병사는 성벽 칸 안에서만.
 * 엔진의 강(river) 칸은 건널 수 있는 여울로 보여 준다 (엔진: 이동 비용 3.5, 받는 피해 +20%) — 속도 절반 + 물보라.
 * 다리 위에서는 두 줄로 좁혀 줄지어 건넌다.
 */
import * as THREE from 'three';
import type { BUnit, Side } from '../../engine/battle/types';
import { lerp, seeded } from '../math';
import { COATS, type SoldierKind } from '../models/soldier';
import { CELL } from './field';
import type { InstancedKit, PoseState } from './kit';

export const KIND_OF: Record<BUnit['kind'], 'spear' | 'arch' | 'cav'> = { infantry: 'spear', cavalry: 'cav', archer: 'arch' };
/** 엔진 병종 이동 속도 (칸/틱) — battle.ts SPEED 와 같은 값 */
const KIND_SPEED: Record<BUnit['kind'], number> = { infantry: 0.34, cavalry: 0.5, archer: 0.3 };
/** 쓰러진 병사가 남는 시간 */
export const CORPSE_SEC = 45;
/** 앞줄 병사가 대열 칸에서 앞으로 나올 수 있는 거리 / 싸울 적을 찾는 거리 */
const STEP_OUT = 0.75;
const ENGAGE = 2.6;
/** 장수가 쫓는 거리 */
const HERO_LEASH = 4.5;
/** 빈 칸 (쓰러진 병사) */
const NO_SLOT = 9999;

const lerpAng = (a: number, b: number, t: number) => {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
};

export class Soldier implements PoseState {
  x = 0;
  y = 0;
  z = 0;
  vx = 0;
  vz = 0;
  yaw = 0;
  walk = 0;
  move = 0;
  bob = 0;
  lean = 0;
  atk = -1;
  cd = 0;
  pose: 'up' | 'low' = 'up';
  aimV = 0;
  aimT = 0;
  dead = false;
  fall = 0;
  fallSign = -1;
  deadT = 0;
  hide = false;
  gone = false;
  scale = 1.15;
  state: 'form' | 'melee' | 'shoot' | 'rout' = 'form';
  target: Soldier | null = null;
  rt = 0;
  /** 대열 칸 번호 (row*cols + col). 쓰러지면 NO_SLOT */
  slotI = 0;
  readonly coat: THREE.Color;
  constructor(
    readonly sq: Squad,
    readonly fc: THREE.Color,
    rnd: (a?: number, b?: number) => number,
    readonly jx = rnd(-0.12, 0.12),
    readonly jz = rnd(-0.12, 0.12),
    readonly seed = rnd(),
  ) {
    this.coat = new THREE.Color(COATS[Math.floor(rnd() * COATS.length)]!);
    this.walk = rnd(0, 6);
    this.cd = rnd(0, 1);
  }
}

/** 부대를 이끄는 장수 */
export class HeroState {
  x = 0;
  z = 0;
  y = 0;
  vx = 0;
  vz = 0;
  yaw = 0;
  walk = 0;
  move = 0;
  /** 일격 동작 0~1, 없으면 -1 */
  atk = -1;
  cd = 0.6;
  gone = false;
  target: Soldier | null = null;
  rt = 0;
  /** 일기토 중: 전장에서 잠시 숨긴다 */
  lock = false;
}

/** 화면 효과용 사건 (stage 가 매 프레임 꺼내 효과로 바꾼다) */
export type SimEvent =
  | { k: 'spark' | 'gold' | 'dust' | 'poof' | 'splash'; x: number; y: number; z: number }
  | { k: 'arrow'; x: number; y: number; z: number; tx: number; ty: number; tz: number }
  | { k: 'shake'; v: number };

export class Squad {
  members: Soldier[] = [];
  readonly hero = new HeroState();
  /** 화면 중심 (월드) = 엔진 칸을 따라가는 부대 위치 */
  cx = 0;
  cz = 0;
  dir = 0;
  mode: 'form' | 'melee' | 'shoot' | 'rout' = 'form';
  alive = 0;
  cols = 6;
  sp = 1.15;
  /** 전선 밀기: 부대 중심에서 앞쪽(+)/뒤쪽(-)으로 밀린 거리 */
  push = 0;
  /** 화면에 보이는가 (적 복병은 드러나기 전까지 숨김) */
  visible = true;
  /** 성벽 위 부대 (엔진 칸이 성벽·성문) */
  onWall = false;
  /** 다리 위 (두 줄로 좁힌다) */
  narrow = false;
  constructor(
    readonly unit: BUnit,
    readonly kind: SoldierKind,
    readonly fc: THREE.Color,
    readonly per: number,
  ) {
    this.dir = unit.side === 'atk' ? Math.PI / 2 : -Math.PI / 2;
  }
  get side(): Side {
    return this.unit.side;
  }
  /** 대열 칸 위치. 진군 중엔 장수 뒤로, 교전 중엔 전선(부대 중심+밀기)에서 뒤로 */
  slot(s: Soldier): [number, number] {
    const cols = this.narrow ? 2 : this.cols;
    const i = s.slotI === NO_SLOT ? 0 : s.slotI;
    // 다리 위에서는 같은 번호를 두 줄로 다시 늘어세운다
    const c = this.narrow ? i % 2 : i % this.cols;
    const r = this.narrow ? Math.floor(i / 2) : Math.floor(i / this.cols);
    const fx = Math.sin(this.dir);
    const fz = Math.cos(this.dir);
    const lat = (c - (cols - 1) / 2) * this.sp;
    const h = this.hero;
    if (this.mode === 'melee' || this.mode === 'shoot' || h.gone || h.lock) {
      const ox = this.cx + fx * this.push;
      const oz = this.cz + fz * this.push;
      const back = r * this.sp;
      return [ox + fz * lat - fx * back + s.jx, oz - fx * lat - fz * back + s.jz];
    }
    const back = 1.7 + r * this.sp;
    return [h.x + fz * lat - fx * back + s.jx, h.z - fx * lat - fz * back + s.jz];
  }
  row(s: Soldier): number {
    return Math.floor(s.slotI / this.cols);
  }
}

/** 병사끼리 겹치지 않게 하는 칸 해시 */
class Grid {
  private m = new Map<number, Soldier[]>();
  constructor(private size: number) {}
  clear() {
    this.m.clear();
  }
  add(s: Soldier) {
    const k = (Math.floor(s.x / this.size) + 512) * 4096 + Math.floor(s.z / this.size) + 512;
    let l = this.m.get(k);
    if (!l) this.m.set(k, (l = []));
    l.push(s);
  }
  query(x: number, z: number, r: number, fn: (s: Soldier) => void) {
    const x0 = Math.floor((x - r) / this.size);
    const x1 = Math.floor((x + r) / this.size);
    const z0 = Math.floor((z - r) / this.size);
    const z1 = Math.floor((z + r) / this.size);
    for (let i = x0; i <= x1; i++)
      for (let j = z0; j <= z1; j++) {
        const l = this.m.get((i + 512) * 4096 + j + 512);
        if (l) for (const s of l) fn(s);
      }
  }
}

/** 지형 판정 (field 가 만든다) */
export interface Walk {
  /** 그 자리에 설 수 있는가: block = 못 감 (깊은 물·성벽·건물·전장 밖), ford = 여울(얕은 강) */
  at(x: number, z: number, onWall: boolean): 'ok' | 'ford' | 'block';
  /** 엔진 칸이 성벽·성문(서 있음)인가 */
  wallCell(cx: number, cy: number): boolean;
  bridgeCell(cx: number, cy: number): boolean;
}

export interface SimOptions {
  /** 이 전투에서 그릴 병사 최대 수 (화질 단계) */
  budget: number;
  viewer: Side;
  heightAt: (x: number, z: number) => number;
  toWorld: (cx: number, cy: number) => [number, number];
  factionColor: (f: string | null) => string;
  kits: Record<'spear' | 'arch' | 'cav', InstancedKit>;
  walk: Walk;
}

export class BattleSim {
  readonly squads: Squad[] = [];
  private all: Soldier[] = [];
  private grid = new Grid(1.5);
  readonly per: number;
  /** 엔진 진행 속도 (초당 틱). 0이면 멈춤 */
  tps = 0;
  /** 이번 프레임에 쓰러진 병사 수 */
  fallen = 0;
  /** 효과 사건 (stage 가 꺼내 쓴다) */
  events: SimEvent[] = [];
  /** 시간 배율 */
  slow = 1;

  constructor(
    units: BUnit[],
    private o: SimOptions,
  ) {
    const rnd = seeded(5);
    const total = units.reduce((s, u) => s + u.startTroops, 0);
    // 병사 1명 = 100명. 예산을 넘으면 1명이 맡는 병력을 늘린다
    this.per = Math.max(100, Math.ceil(total / o.budget / 50) * 50);
    for (const u of units) {
      const kind = KIND_OF[u.kind];
      const sq = new Squad(u, kind, new THREE.Color(o.factionColor(u.faction)), this.per);
      const [x, z] = o.toWorld(u.x, u.y);
      sq.cx = x;
      sq.cz = z;
      const n = Math.max(1, Math.ceil(u.troops / this.per));
      sq.cols = n <= 8 ? 4 : n <= 24 ? 6 : 8;
      for (let i = 0; i < n; i++) {
        const s = new Soldier(sq, sq.fc, rnd);
        s.slotI = i;
        if (!o.kits[kind].add(s)) break;
        sq.members.push(s);
        this.all.push(s);
      }
      this.placeAll(sq);
      this.squads.push(sq);
    }
  }

  private placeAll(sq: Squad) {
    const h = sq.hero;
    h.x = sq.cx + Math.sin(sq.dir) * 1.2;
    h.z = sq.cz + Math.cos(sq.dir) * 1.2;
    h.y = this.o.heightAt(h.x, h.z);
    h.yaw = sq.dir;
    for (const s of sq.members) {
      if (s.dead) continue;
      const [x, z] = sq.slot(s);
      s.x = x;
      s.z = z;
      s.y = this.o.heightAt(x, z);
      s.yaw = sq.dir;
    }
  }

  /** dt = 실제 시간(초). 엔진 상태를 읽어 병사를 움직인다 */
  update(dt: number): void {
    dt *= this.slow;
    this.fallen = 0;
    const sdt = this.tps > 0 ? dt : 0;
    for (const sq of this.squads) this.syncSquad(sq, dt, sdt);
    this.grid.clear();
    for (const s of this.all) if (!s.dead && !s.gone && !s.hide) this.grid.add(s);
    for (const sq of this.squads) this.stepHero(sq, sdt);
    for (const s of this.all) this.stepSoldier(s, sdt);
    for (const k of Object.values(this.o.kits)) k.sync();
  }

  private nearestSquad(sq: Squad): { q: Squad; d: number } | null {
    let best: Squad | null = null;
    let bd = 1e9;
    for (const q of this.squads) {
      if (q.side === sq.side || !q.visible || q.alive === 0 || q.mode === 'rout' || q.unit.status !== 'active') continue;
      const d = Math.hypot(q.cx - sq.cx, q.cz - sq.cz);
      if (d < bd) (bd = d), (best = q);
    }
    return best ? { q: best, d: bd } : null;
  }

  private syncSquad(sq: Squad, dt: number, sdt: number) {
    const u = sq.unit;
    sq.visible = !(u.hidden && u.side !== this.o.viewer);
    sq.onWall = this.o.walk.wallCell(u.x, u.y);
    sq.narrow = this.o.walk.bridgeCell(u.x, u.y);
    // 위치: 엔진 칸을 병종 속도로 따라간다. 멀리 떨어지면(배치·되돌리기) 순간 이동
    const [tx, tz] = this.o.toWorld(u.x, u.y);
    const dx = tx - sq.cx;
    const dz = tz - sq.cz;
    const dist = Math.hypot(dx, dz);
    if (dist > CELL * 3) {
      sq.cx = tx;
      sq.cz = tz;
      this.placeAll(sq);
    } else if (dist > 0.01 && sdt > 0) {
      const v = Math.max(0.6, KIND_SPEED[u.kind] * this.tps) * CELL * (1 + Math.max(0, dist / CELL - 0.6) * 1.5);
      const step = Math.min(dist, v * dt);
      sq.cx += (dx / dist) * step;
      sq.cz += (dz / dist) * step;
      if (dist > 0.3) sq.dir = lerpAng(sq.dir, Math.atan2(dx, dz), Math.min(1, dt * 3));
    }
    sq.alive = sq.members.reduce((n, s) => n + (s.dead ? 0 : 1), 0);
    const near = this.nearestSquad(sq);
    const reach = (u.kind === 'archer' ? 3.2 : 1.6) * CELL;
    if (u.status === 'routed' || u.status === 'retreated' || u.order.type === 'retreat') sq.mode = 'rout';
    else if (near && near.d <= reach) {
      sq.mode = u.kind === 'archer' ? 'shoot' : 'melee';
      sq.dir = lerpAng(sq.dir, Math.atan2(near.q.cx - sq.cx, near.q.cz - sq.cz), Math.min(1, dt * 4));
    } else {
      sq.mode = 'form';
      if (near && near.d < 30 && dist < 0.3) sq.dir = lerpAng(sq.dir, Math.atan2(near.q.cx - sq.cx, near.q.cz - sq.cz), Math.min(1, dt * 2));
    }
    // 전선 밀기: 병력×사기 비율로 이기는 쪽이 조금씩 나아간다 (최대 ±1.5)
    let pushT = 0;
    if (sq.mode === 'melee' && near) {
      const mine = u.troops * (0.5 + u.morale / 200);
      const theirs = near.q.unit.troops * (0.5 + near.q.unit.morale / 200);
      pushT = Math.max(-1.5, Math.min(1.5, (mine / Math.max(1, theirs) - 1) * 1.2));
    }
    sq.push = lerp(sq.push, pushT, Math.min(1, sdt * 0.4));
    // 피해: 엔진 병력에 맞춰 앞줄부터 쓰러뜨리고, 같은 줄 뒤 병사를 한 칸씩 당긴다
    const want = u.status === 'active' || u.status === 'routed' || u.status === 'retreated' ? Math.ceil(Math.max(0, u.troops) / this.per) : 0;
    let extra = sq.alive - want;
    if (extra > 0) {
      const live = sq.members.filter((s) => !s.dead && !s.gone).sort((a, b) => a.slotI - b.slotI);
      const foe = near?.q;
      for (const s of live) {
        if (extra-- <= 0) break;
        this.kill(s, foe ? foe.cx : s.x + Math.sin(sq.dir), foe ? foe.cz : s.z + Math.cos(sq.dir));
        this.refill(sq, s);
      }
    }
    for (const s of sq.members) {
      s.hide = s.gone || !sq.visible || (sq.hero.lock && false);
      if (!s.dead && !s.gone) s.state = sq.mode === 'rout' ? 'rout' : sq.mode;
    }
  }

  /** 쓰러진 병사 자리를 같은 세로줄 뒤 병사가 한 칸씩 당겨 메운다 */
  private refill(sq: Squad, dead: Soldier) {
    const col = dead.slotI % sq.cols;
    const row = Math.floor(dead.slotI / sq.cols);
    const behind = sq.members.filter((m) => !m.dead && !m.gone && m.slotI !== NO_SLOT && m.slotI % sq.cols === col && Math.floor(m.slotI / sq.cols) > row).sort((a, b) => a.slotI - b.slotI);
    let r = row;
    for (const m of behind) m.slotI = r++ * sq.cols + col;
    dead.slotI = NO_SLOT;
  }

  private kill(s: Soldier, fromX: number, fromZ: number) {
    s.dead = true;
    s.fall = 0;
    s.deadT = 0;
    s.atk = -1;
    const away = Math.atan2(s.x - fromX, s.z - fromZ);
    s.fallSign = Math.cos(away - s.yaw) >= 0 ? 1 : -1;
    this.fallen++;
    if (this.fallen <= 6) this.events.push({ k: 'dust', x: s.x, y: s.y, z: s.z });
  }

  /** (x,z) 에서 r 안의 가장 가까운 적 병사 (같은 높이 = 성벽 위끼리·땅끼리만 근접) */
  private nearestEnemyOf(sq: Squad, x: number, z: number, r: number): Soldier | null {
    let best: Soldier | null = null;
    let bd = r * r;
    this.grid.query(x, z, r, (o) => {
      if (o.sq.side === sq.side || o.dead || o.state === 'rout' || o.sq.onWall !== sq.onWall) return;
      const d = (o.x - x) ** 2 + (o.z - z) ** 2;
      if (d < bd) (bd = d), (best = o);
    });
    return best;
  }

  /** 지형 규칙을 지키며 옮긴다: 막히면 축 하나씩 미끄러지고, 그래도 막히면 제자리. 여울이면 속도 절반 */
  private move(s: { x: number; z: number; vx: number; vz: number }, onWall: boolean, dt: number): 'ok' | 'ford' | 'block' {
    const W = this.o.walk;
    const here = W.at(s.x, s.z, onWall);
    const k = here === 'ford' ? 0.5 : 1;
    const nx = s.x + s.vx * dt * k;
    const nz = s.z + s.vz * dt * k;
    if (W.at(nx, nz, onWall) !== 'block') {
      s.x = nx;
      s.z = nz;
    } else if (W.at(nx, s.z, onWall) !== 'block') {
      s.x = nx;
      s.vz = 0;
    } else if (W.at(s.x, nz, onWall) !== 'block') {
      s.z = nz;
      s.vx = 0;
    } else {
      s.vx = s.vz = 0;
      return 'block';
    }
    return W.at(s.x, s.z, onWall);
  }

  private stepHero(sq: Squad, dt: number) {
    const h = sq.hero;
    if (h.gone || h.lock) return;
    const u = sq.unit;
    if (u.status === 'dead' || u.status === 'captured') {
      h.gone = true;
      this.events.push({ k: 'poof', x: h.x, y: h.y + 1, z: h.z });
      return;
    }
    if (dt <= 0) return;
    const fx = Math.sin(sq.dir);
    const fz = Math.cos(sq.dir);
    // 기본 자리: 진군 = 부대 맨 앞, 교전 = 전선 바로 앞
    let gx = sq.cx + fx * (sq.mode === 'melee' ? sq.push + 1.4 : 1.2);
    let gz = sq.cz + fz * (sq.mode === 'melee' ? sq.push + 1.4 : 1.2);
    let face = sq.dir;
    let spd = Math.max(2.4, KIND_SPEED[u.kind] * this.tps * CELL * 1.8);
    if (sq.mode === 'rout') {
      const back = sq.side === 'atk' ? -1 : 1;
      gx = h.x + back * 10;
      gz = h.z;
      face = back > 0 ? Math.PI / 2 : -Math.PI / 2;
      spd = 6;
      if (Math.abs(h.x) > 52) {
        h.gone = true;
        this.events.push({ k: 'poof', x: h.x, y: h.y + 1, z: h.z });
      }
    } else if (sq.mode === 'melee') {
      if (!h.target || h.target.dead || h.target.gone || (h.rt -= dt) < 0) {
        h.target = this.nearestEnemyOf(sq, gx, gz, HERO_LEASH);
        h.rt = 1;
      }
      const t = h.target;
      if (t && Math.hypot(t.x - gx, t.z - gz) <= HERO_LEASH) {
        const dx = t.x - h.x;
        const dz = t.z - h.z;
        const d = Math.hypot(dx, dz);
        face = Math.atan2(dx, dz);
        if (d > 1.8) {
          gx = t.x - (dx / d) * 1.5;
          gz = t.z - (dz / d) * 1.5;
          spd = 5;
        } else {
          gx = h.x;
          gz = h.z;
          if ((h.cd -= dt) <= 0 && h.atk < 0) {
            h.atk = 0;
            h.cd = 1.05;
          }
        }
      }
    }
    if (h.atk >= 0) {
      const before = h.atk;
      h.atk += dt * 2;
      if (before < 0.55 && h.atk >= 0.55) {
        const hx = Math.sin(h.yaw);
        const hz = Math.cos(h.yaw);
        this.events.push({ k: 'gold', x: h.x + hx * 1.4, y: h.y + 1.8, z: h.z + hz * 1.4 }, { k: 'shake', v: 0.12 });
        // 장수 일격에 맞은 적은 튕겨 나간다 (병력 감소는 엔진 값)
        this.grid.query(h.x + hx * 1.4, h.z + hz * 1.4, 1.6, (o) => {
          if (o.sq.side === sq.side || o.dead) return;
          o.vx += hx * 4;
          o.vz += hz * 4;
        });
      }
      if (h.atk >= 1) h.atk = -1;
    }
    const dx = gx - h.x;
    const dz = gz - h.z;
    const d = Math.hypot(dx, dz);
    const sp = Math.min(spd, d * 2.5);
    const k = Math.min(1, dt * 5);
    h.vx += ((d > 0.05 ? dx / d : 0) * sp - h.vx) * k;
    h.vz += ((d > 0.05 ? dz / d : 0) * sp - h.vz) * k;
    const w = this.move(h, sq.onWall, dt);
    h.y = this.o.heightAt(h.x, h.z);
    const v = Math.hypot(h.vx, h.vz);
    h.yaw = lerpAng(h.yaw, v > 1 && h.atk < 0 ? Math.atan2(h.vx, h.vz) : face, Math.min(1, dt * 6));
    h.move = lerp(h.move, Math.min(1, v / 4), Math.min(1, dt * 6));
    h.walk += dt * (1 + v * 2.4);
    // 병사를 장수 몸에서 밀어낸다
    this.grid.query(h.x, h.z, 1.4, (o) => {
      if (o.dead) return;
      const ox = o.x - h.x;
      const oz = o.z - h.z;
      const dd = Math.hypot(ox, oz);
      if (dd < 1.3 && dd > 0.01) {
        o.vx += (ox / dd) * (1.3 - dd) * 6;
        o.vz += (oz / dd) * (1.3 - dd) * 6;
      }
    });
    if (v > 1 && w === 'ford' && Math.random() < dt * 8) this.events.push({ k: 'splash', x: h.x, y: h.y, z: h.z });
    else if (v > 2 && Math.random() < dt * 6) this.events.push({ k: 'dust', x: h.x, y: h.y, z: h.z });
  }

  private stepSoldier(s: Soldier, dt: number) {
    if (s.gone) return;
    const sq = s.sq;
    const H = this.o.heightAt;
    if (s.dead) {
      if (dt <= 0) return;
      s.fall = Math.min(1, s.fall + dt * 3.2);
      s.deadT += dt;
      s.bob = 0;
      s.y = H(s.x, s.z);
      if (s.deadT > CORPSE_SEC) s.y -= (s.deadT - CORPSE_SEC) * 0.4;
      if (s.deadT > CORPSE_SEC + 2) s.gone = true;
      return;
    }
    if (dt <= 0) return;
    let gx = s.x;
    let gz = s.z;
    let face: number | null = null;
    const march = Math.max(1.6, KIND_SPEED[sq.unit.kind] * this.tps * CELL * 1.6);
    let spd = march;
    const front = sq.row(s) === 0;
    switch (s.state) {
      case 'form': {
        [gx, gz] = sq.slot(s);
        face = sq.dir;
        s.pose = 'up';
        break;
      }
      case 'shoot': {
        [gx, gz] = sq.slot(s);
        face = sq.dir;
        if ((s.cd -= dt) <= 0) {
          s.aimT = 0.7;
          s.cd = 1.2 + s.seed;
          // 활 (성벽 위·아래 사이도 활은 닿는다). 보이기만 한다, 피해는 엔진 값
          let t: Soldier | null = null;
          let bd = 16 * 16;
          this.grid.query(s.x, s.z, 16, (o) => {
            if (o.sq.side === sq.side || o.dead) return;
            const dd = (o.x - s.x) ** 2 + (o.z - s.z) ** 2;
            if (dd < bd) (bd = dd), (t = o);
          });
          const tt = t as Soldier | null;
          if (tt && s.seed < 0.55) this.events.push({ k: 'arrow', x: s.x, y: s.y + 1.1, z: s.z, tx: tt.x + (s.seed - 0.3) * 2, ty: tt.y, tz: tt.z + s.jx * 6 });
        }
        break;
      }
      case 'melee': {
        // 대열 칸을 지킨다. 앞줄만 0.75까지 나와 2.6 안의 적과 싸우고, 뒷줄은 창을 겨눈 채 대기
        [gx, gz] = sq.slot(s);
        face = sq.dir;
        s.pose = 'low';
        spd = 2.4;
        if (front) {
          if (!s.target || s.target.dead || s.target.gone || (s.rt -= dt) < 0) {
            s.target = this.nearestEnemyOf(sq, s.x, s.z, ENGAGE);
            s.rt = 0.4 + s.seed * 0.5;
          }
          const t = s.target;
          if (t) {
            const dx = t.x - s.x;
            const dz = t.z - s.z;
            const d = Math.hypot(dx, dz) || 1e-3;
            if (d > ENGAGE + 0.3) s.target = null;
            else {
              face = Math.atan2(dx, dz);
              const st = Math.min(STEP_OUT, Math.max(0, d - 0.9));
              gx += (dx / d) * st;
              gz += (dz / d) * st;
              if (d < 1.1 && (s.cd -= dt) <= 0 && s.atk < 0) {
                s.atk = 0;
                s.cd = 0.45 + s.seed * 0.65;
              }
            }
          }
        }
        break;
      }
      case 'rout': {
        // 도망도 지형 규칙을 지킨다 (물·벽에 막히면 미끄러져 돈다)
        const back = sq.side === 'atk' ? -1 : 1;
        gx = s.x + back * 10;
        gz = s.z + (s.seed - 0.5) * 4;
        spd = 3.4;
        if (Math.abs(s.x) > 50) s.gone = true;
        break;
      }
    }
    if (s.atk >= 0) {
      const before = s.atk;
      s.atk += dt * 2.4;
      const t = s.target;
      if (before < 0.55 && s.atk >= 0.55 && t && !t.dead && Math.hypot(t.x - s.x, t.z - s.z) < 1.3) {
        // 맞붙는 곳에 불꽃·먼지, 맞고 버틴 병사는 뒤로 살짝 튕겼다가 대열 칸으로 돌아온다
        const ax = (t.x - s.x) / (Math.hypot(t.x - s.x, t.z - s.z) || 1);
        const az = (t.z - s.z) / (Math.hypot(t.x - s.x, t.z - s.z) || 1);
        t.vx += ax * 2.6;
        t.vz += az * 2.6;
        if (s.seed < 0.4) this.events.push({ k: 'spark', x: (s.x + t.x) / 2, y: s.y + 0.8, z: (s.z + t.z) / 2 });
        else if (s.seed < 0.6) this.events.push({ k: 'dust', x: t.x, y: t.y, z: t.z });
      }
      if (s.atk >= 1) s.atk = -1;
    }
    const dx = gx - s.x;
    const dz = gz - s.z;
    const d = Math.hypot(dx, dz);
    let tvx = 0;
    let tvz = 0;
    if (d > 0.05) {
      const sp = Math.min(spd, d * 3);
      tvx = (dx / d) * sp;
      tvz = (dz / d) * sp;
    }
    // 최소 간격 (서로 밀어내기)
    this.grid.query(s.x, s.z, 0.75, (o) => {
      if (o === s) return;
      const ox = s.x - o.x;
      const oz = s.z - o.z;
      const dd = ox * ox + oz * oz;
      if (dd < 0.5 && dd > 1e-6) {
        const f = (0.71 - Math.sqrt(dd)) * 5;
        tvx += ox * f;
        tvz += oz * f;
      }
    });
    const k = Math.min(1, dt * 7);
    s.vx += (tvx - s.vx) * k;
    s.vz += (tvz - s.vz) * k;
    const w = this.move(s, sq.onWall, dt);
    s.y = H(s.x, s.z);
    const v = Math.hypot(s.vx, s.vz);
    const cav = sq.kind === 'cav';
    s.move = Math.min(1, v / 2.2);
    s.walk += v * dt * (cav ? 2.6 : 5.2);
    const ty = v > 0.6 && s.atk < 0 && s.state !== 'melee' ? Math.atan2(s.vx, s.vz) : (face ?? s.yaw);
    s.yaw = lerpAng(s.yaw, ty, Math.min(1, dt * 8));
    s.bob = cav ? Math.abs(Math.sin(s.walk * 0.8)) * 0.12 * s.move : Math.abs(Math.sin(s.walk)) * 0.07 * s.move;
    s.lean = (cav ? Math.sin(s.walk * 0.8) * 0.06 * s.move : 0) + 0.08 * s.move;
    if (v > 0.8 && w === 'ford' && Math.random() < dt * 3) this.events.push({ k: 'splash', x: s.x, y: s.y, z: s.z });
    else if (v > 1.2 && Math.random() < dt * (cav ? 6 : 1.1)) this.events.push({ k: 'dust', x: s.x, y: s.y, z: s.z });
    if (s.aimT > 0) s.aimT -= dt;
    s.aimV = lerp(s.aimV, s.aimT > 0 ? 1 : 0, Math.min(1, dt * 9));
  }

  /** 부대 표시(이름·병력) 위치: 장수 머리 위 (장수가 없으면 부대 중심) */
  labelAnchor(sq: Squad, out: THREE.Vector3): THREE.Vector3 {
    const h = sq.hero;
    return h.gone ? out.set(sq.cx, this.o.heightAt(sq.cx, sq.cz) + 3.2, sq.cz) : out.set(h.x, h.y + 4.6, h.z);
  }

  get soldierCount(): number {
    return this.all.length;
  }
}
