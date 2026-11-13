/**
 * 자동 병과 배정 (전투 수정 요청 2026-11-13 ②④).
 * - 특기(기병·궁술)가 있으면 그 병과.
 * - 없으면 싸움 형태에 맞는 비율로 채운다. 한 병과가 절반(올림)을 넘지 않는다.
 *   · 공격·성: 창병 위주 + 궁병 1~2, 기병 최대 1
 *   · 공격·야전: 창병 위주 + 기병 1~2 + 궁병 1
 *   · 수비·농성: 궁병 가장 많이 + 창병, 기병 최대 1
 *   · 수비·야전: 창병 + 기병 1~2 + 궁병 1
 * - 공격·성이면 자동 배정 창병 하나를 충차대(ram)로 지정한다.
 * 플레이어가 직접 고른 병과(autoKind 가 아닌 부대)는 건드리지 않는다.
 */
import type { BattleState, BUnit, DefPolicy, Side, UnitKind } from './types';

export type FightMode = 'siege' | 'field' | 'castle';

/** 성 안에서 버티는 수비 방침 (나머지는 성 밖으로 나가 싸운다) */
export const IN_CASTLE_POLICIES: DefPolicy[] = ['def_hold', 'def_depth', 'def_delay'];

/** 수비 방침이 정해졌으면 그에 맞는 싸움 형태, 아직이면 농성/공성으로 본다 */
export function modesOf(b: BattleState): { atk: FightMode; def: FightMode } {
  const dp = b.plans?.def?.policy as DefPolicy | undefined;
  const castle = !dp || IN_CASTLE_POLICIES.includes(dp);
  return { atk: castle ? 'siege' : 'field', def: castle ? 'castle' : 'field' };
}

/** n개 부대의 병과 목표 수 */
export function targetMix(mode: FightMode, n: number): Record<UnitKind, number> {
  const cap = Math.ceil(n / 2);
  let m: Record<UnitKind, number>;
  if (mode === 'siege') m = { archer: n >= 4 ? 2 : n >= 2 ? 1 : 0, cavalry: n >= 5 ? 1 : 0, infantry: 0 };
  else if (mode === 'castle') m = { archer: cap, cavalry: n >= 5 ? 1 : 0, infantry: 0 };
  else m = { cavalry: n >= 4 ? 2 : n >= 2 ? 1 : 0, archer: n >= 3 ? 1 : 0, infantry: 0 };
  m.infantry = Math.max(0, n - m.archer - m.cavalry);
  // 한 병과가 절반을 넘으면 넘는 몫을 다른 병과로 (농성은 궁병, 그 밖은 창병이 넘치기 쉬움)
  const order: UnitKind[] = mode === 'castle' ? ['infantry', 'cavalry'] : ['archer', 'cavalry'];
  for (const k of ['infantry', 'archer', 'cavalry'] as UnitKind[]) {
    while (m[k] > cap && n > 2) {
      const to = order.find((o) => o !== k && m[o] < cap && (o !== 'cavalry' || mode === 'field' || m.cavalry < 1));
      if (!to) break;
      m[k]--;
      m[to]++;
    }
  }
  return m;
}

const skillKind = (u: BUnit): UnitKind | null => (u.skills.includes('cavalry') ? 'cavalry' : u.skills.includes('archery') ? 'archer' : null);

/** 한 쪽의 자동 병과 부대를 mode 에 맞게 다시 배정한다 */
export function assignAutoKinds(b: BattleState, side: Side, mode: FightMode): void {
  const us = b.units.filter((u) => u.side === side && u.status === 'active');
  const n = us.length;
  if (!n) return;
  const want = targetMix(mode, n);
  // 고정(직접 고름·특기)부터 센다
  const free: BUnit[] = [];
  for (const u of us) {
    u.ram = false;
    const k = u.autoKind ? skillKind(u) : u.kind;
    if (k) {
      u.kind = k;
      want[k] = Math.max(0, want[k] - 1);
    } else free.push(u);
  }
  // 기병은 무력, 궁병은 지력이 무력보다 높은 순, 나머지 창병
  const take = (k: UnitKind, score: (u: BUnit) => number) => {
    free.sort((p, q) => score(q) - score(p));
    for (let i = 0; i < want[k] && free.length; i++) free.shift()!.kind = k;
  };
  if (mode === 'castle') {
    take('archer', (u) => u.int - u.war);
    take('cavalry', (u) => u.war);
  } else {
    take('cavalry', (u) => u.war);
    take('archer', (u) => u.int - u.war);
  }
  for (const u of free) u.kind = 'infantry';
  // 공격·성: 자동 창병 하나를 충차대로 (총대장 제외, 병력 많은 부대)
  if (side === 'atk' && mode === 'siege') {
    const commander = b.plans?.atk?.commander;
    const ram = us
      .filter((u) => u.autoKind && u.kind === 'infantry' && u.id !== commander)
      .sort((p, q) => q.troops - p.troops)[0] ?? us.filter((u) => u.autoKind && u.kind === 'infantry').sort((p, q) => q.troops - p.troops)[0];
    if (ram) ram.ram = true;
  }
}

/** 양쪽 자동 병과를 지금 작전 기준으로 맞춘다 */
export function assignAllAutoKinds(b: BattleState): void {
  const m = modesOf(b);
  assignAutoKinds(b, 'atk', m.atk);
  assignAutoKinds(b, 'def', m.def);
}

/** 충차대 효과 (전투 수정 요청 ④) */
export const RAM = {
  /** 성문 피해 배율 */
  gate: 3,
  /** 이동 속도 배율 */
  speed: 0.6,
  /** 성벽 위 궁병에게 받는 피해 배율 */
  hurtByWallArcher: 1.5,
};
