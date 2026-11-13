/**
 * 작전 회의 → 자동 전투 (전투개편_작전자동전투_설계서.md 16장 1단계)
 * - 전군 방침: 공격 6종(A1~A6), 방어 6종(D1~D6)
 * - 역할 5개, 태도 3단계, 퇴각 기준
 * - 6×6 상성 (6-1, 6-2), 실행도 (10-3)
 * 방침은 데이터 형태로 두어 수치만 고쳐 밸런스를 맞출 수 있게 했다.
 */
import { tileAt } from './battle';
import type { AtkPolicy, BattleState, BUnit, DefPolicy, DuelPolicy, PolicyId, Role, Side, SidePlan, Stance, UnitPlan } from './types';

export interface PolicyDef {
  id: PolicyId;
  side: Side;
  /** 설계서 번호 (A1, D1 …) */
  code: string;
  name: string;
  desc: string;
  /** 수비 방침: 성 안에서 버티는지, 성 밖으로 나가 싸우는지 (작전 회의 카드에 한 줄) */
  ground?: string;
  /** 필요 조건 설명 (화면 표시) */
  needs: string;
  strong: string;
  weak: string;
  /** 요구 실행도 (10-3) */
  reqExec: number;
  /** 역할별 기본 태도 */
  stance: Record<Role, Stance>;
  /** 기본 퇴각 기준 (병력 비율) */
  retreatAt: number;
  /** 밸런스 조정값: 이 방침 부대가 주는 피해 배율 보정. scripts/policy-matrix.ts 자동 보정으로 정한 값 (2026-11-12, 조합당 16회 × 8회 반복) */
  power?: number;
}

const S = (vanguard: Stance, main: Stance, wing: Stance, reserve: Stance): Record<Role, Stance> => ({ vanguard, main, left: wing, right: wing, reserve });

export const POLICIES: Record<PolicyId, PolicyDef> = {
  atk_front: {
    id: 'atk_front', side: 'atk', code: 'A1', name: '정면 돌파', desc: '전군이 정면으로 전진해 맞붙는다',
    needs: '없음', strong: '지연전', weak: '유인 역습, 매복 요격, 견고 수비', reqExec: 0,
    stance: S('aggressive', 'aggressive', 'balanced', 'balanced'), retreatAt: 0.25, power: -0.068,
  },
  atk_pincer: {
    id: 'atk_pincer', side: 'atk', code: 'A2', name: '학익 포위', desc: '양익이 크게 돌아 적을 감싼다',
    needs: '부대 3개 이상 (기병이 있으면 좋음)', strong: '견고 수비, 종심 방어', weak: '선제 출격, 매복 요격', reqExec: 55,
    stance: S('balanced', 'balanced', 'aggressive', 'cautious'), retreatAt: 0.3, power: -0.078,
  },
  atk_wedge: {
    id: 'atk_wedge', side: 'atk', code: 'A3', name: '추행 돌파', desc: '정예를 쐐기처럼 모아 적 중앙을 가른다',
    needs: '무력 또는 통솔 80 이상인 선봉', strong: '견고 수비, 선제 출격', weak: '종심 방어, 유인 역습', reqExec: 45,
    stance: S('aggressive', 'aggressive', 'aggressive', 'balanced'), retreatAt: 0.25, power: -0.027,
  },
  atk_feint: {
    id: 'atk_feint', side: 'atk', code: 'A4', name: '성동격서', desc: '일부가 한쪽을 치는 척하고 주력이 반대쪽을 친다',
    needs: '총대장 또는 군사 지력 70 이상', strong: '견고 수비, 종심 방어, 유인 역습', weak: '선제 출격', reqExec: 70,
    stance: S('balanced', 'aggressive', 'balanced', 'balanced'), retreatAt: 0.3, power: -0.034,
  },
  atk_lure: {
    id: 'atk_lure', side: 'atk', code: 'A5', name: '유인 매복', desc: '약한 부대가 패주하는 척하며 적을 매복지로 끌어들인다',
    needs: '전장에 숲·산, 부대 2개 이상', strong: '선제 출격', weak: '견고 수비, 지연전', reqExec: 60,
    stance: S('cautious', 'aggressive', 'aggressive', 'balanced'), retreatAt: 0.3, power: -0.077,
  },
  atk_fire: {
    id: 'atk_fire', side: 'atk', code: 'A6', name: '화공 작전', desc: '바람과 지형을 이용해 적 진영에 불을 지른다',
    needs: '비가 오지 않을 것, 지력 70 이상 또는 화계 특기 장수', strong: '견고 수비, 종심 방어, 유인 역습, 매복 요격', weak: '선제 출격, 지연전', reqExec: 60,
    stance: S('cautious', 'balanced', 'cautious', 'cautious'), retreatAt: 0.3, power: -0.06,
  },
  def_hold: {
    id: 'def_hold', side: 'def', code: 'D1', name: '견고 수비', ground: '성 안에서 버틴다', desc: '유리한 자리에 버티고 서서 방어 보너스를 받는다',
    needs: '없음', strong: '정면 돌파, 유인 매복', weak: '학익 포위, 화공, 성동격서', reqExec: 0,
    stance: S('balanced', 'balanced', 'balanced', 'cautious'), retreatAt: 0.25, power: 0.08,
  },
  def_depth: {
    id: 'def_depth', side: 'def', code: 'D2', name: '종심 방어', ground: '성 안에서 버틴다', desc: '방어선을 여러 겹으로 두어 앞이 뚫려도 뒤가 막는다',
    needs: '부대 3개 이상', strong: '추행 돌파, 정면 돌파, 유인 매복', weak: '학익 포위, 성동격서, 화공', reqExec: 45,
    stance: S('balanced', 'balanced', 'cautious', 'balanced'), retreatAt: 0.3, power: 0.132,
  },
  def_counter: {
    id: 'def_counter', side: 'def', code: 'D3', name: '유인 역습', ground: '성 밖으로 나가 싸운다', desc: '일부러 중앙을 내주고 들어온 적을 양쪽에서 감싼다',
    needs: '지력 70 이상 지휘관, 부대 3개 이상', strong: '정면 돌파, 추행 돌파', weak: '성동격서, 화공', reqExec: 65,
    stance: S('cautious', 'balanced', 'aggressive', 'balanced'), retreatAt: 0.3, power: 0.099,
  },
  def_ambush: {
    id: 'def_ambush', side: 'def', code: 'D4', name: '매복 요격', ground: '성 밖으로 나가 싸운다', desc: '적의 예상 진격로에 복병을 숨긴다',
    needs: '전장에 숲·산', strong: '정면 돌파, 학익 포위', weak: '화공', reqExec: 55,
    stance: S('balanced', 'aggressive', 'aggressive', 'balanced'), retreatAt: 0.3, power: -0.004,
  },
  def_sally: {
    id: 'def_sally', side: 'def', code: 'D5', name: '선제 출격', ground: '성 밖으로 나가 싸운다', desc: '적이 진형을 갖추기 전에 먼저 친다',
    needs: '없음 (기병이 있으면 좋음)', strong: '학익 포위, 화공, 성동격서', weak: '추행 돌파, 유인 매복', reqExec: 40,
    stance: S('aggressive', 'aggressive', 'aggressive', 'balanced'), retreatAt: 0.3, power: -0.024,
  },
  def_delay: {
    id: 'def_delay', side: 'def', code: 'D6', name: '지연전', ground: '성 안에서 버틴다', desc: '싸우며 물러나 시간을 끈다 (30일을 버티면 수비 승리)',
    needs: '없음', strong: '유인 매복, 화공', weak: '정면 돌파, 학익 포위, 추행 돌파', reqExec: 35,
    stance: S('cautious', 'cautious', 'cautious', 'cautious'), retreatAt: 0.2, power: 0.051,
  },
};

export const ATK_POLICIES: AtkPolicy[] = ['atk_front', 'atk_pincer', 'atk_wedge', 'atk_feint', 'atk_lure', 'atk_fire'];
export const DEF_POLICIES: DefPolicy[] = ['def_hold', 'def_depth', 'def_counter', 'def_ambush', 'def_sally', 'def_delay'];

/**
 * 6-1 핵심 6×6 상성 (공격 → 방어). 양수 = 공격 측 유리, 음수 = 방어 측 유리.
 * ▲▲/▼▼ = 0.25, ▲/▼ = 0.12, ― = 0 (6-2)
 */
const UU = 0.25;
const U = 0.12;
export const MATCHUP: Record<AtkPolicy, Record<DefPolicy, number>> = {
  //            견고 수비  종심 방어  유인 역습  매복 요격  선제 출격  지연전
  atk_front:  { def_hold: -U, def_depth: -U, def_counter: -UU, def_ambush: -UU, def_sally: 0, def_delay: U },
  atk_pincer: { def_hold: UU, def_depth: U, def_counter: 0, def_ambush: -U, def_sally: -U, def_delay: U },
  atk_wedge:  { def_hold: U, def_depth: -UU, def_counter: -UU, def_ambush: 0, def_sally: U, def_delay: U },
  atk_feint:  { def_hold: U, def_depth: U, def_counter: U, def_ambush: 0, def_sally: -U, def_delay: 0 },
  atk_lure:   { def_hold: -UU, def_depth: -U, def_counter: 0, def_ambush: 0, def_sally: UU, def_delay: -U },
  atk_fire:   { def_hold: UU, def_depth: U, def_counter: U, def_ambush: U, def_sally: -UU, def_delay: -U },
};

/** 상성 기호 (보고서·작전 회의 표시용) — 공격 측 관점 */
export function matchupSymbol(v: number): string {
  if (v >= 0.2) return '▲▲';
  if (v > 0) return '▲';
  if (v <= -0.2) return '▼▼';
  if (v < 0) return '▼';
  return '―';
}

export const ROLE_NAME: Record<Role, string> = { vanguard: '선봉', main: '중군', left: '좌익', right: '우익', reserve: '예비대' };
export const STANCE_NAME: Record<Stance, string> = { aggressive: '공격', balanced: '균형', cautious: '신중' };
export const ROLES: Role[] = ['vanguard', 'main', 'left', 'right', 'reserve'];
export const STANCES: Stance[] = ['aggressive', 'balanced', 'cautious'];
/** 퇴각 기준 선택지 (병력 비율). 0 = 끝까지 */
export const RETREAT_OPTIONS = [0.5, 0.3, 0.15, 0] as const;

// ───────────────────────────── 실행도 ─────────────────────────────

export function sideUnits(b: BattleState, side: Side): BUnit[] {
  return b.units.filter((u) => u.side === side && u.status === 'active');
}

/** 총대장: 공격은 첫 출진 장수, 방어는 태수 (없으면 병력이 가장 많은 부대) */
export function commanderOf(b: BattleState, side: Side): BUnit | undefined {
  const us = sideUnits(b, side);
  const lead = b.leaders?.[side];
  return us.find((u) => u.officer === lead) ?? us[0];
}

/** 군사: 출진 장수 중 지력이 가장 높은 사람 */
export function advisorOf(b: BattleState, side: Side): BUnit | undefined {
  const us = sideUnits(b, side);
  return us.length ? us.reduce((a, c) => (c.int > a.int ? c : a)) : undefined;
}

/** 실행도 = 총대장 통솔 × 0.5 + 군사 지력 × 0.3 + 부대 평균 훈련도 × 0.2 (10-3) */
export function executionOf(b: BattleState, side: Side): number {
  const us = sideUnits(b, side);
  if (!us.length) return 0;
  const c = commanderOf(b, side)!;
  const a = advisorOf(b, side)!;
  const tr = us.reduce((s, u) => s + u.training, 0) / us.length;
  return Math.round(c.lea * 0.5 + a.int * 0.3 + tr * 0.2);
}

/**
 * 실행 계수: 요구치 이상이면 1, 15 이내로 모자라면 비례해서 0까지 줄고,
 * 그보다 더 모자라면 음수 (부대들이 따로 놀아 오히려 불리, 최저 -1)
 */
export function execFactor(execution: number, req: number): number {
  const short = req - execution;
  if (short <= 0) return 1;
  if (short <= 15) return 1 - short / 15;
  return Math.max(-1, -(short - 15) / 25);
}

// ───────────────────────────── 필요 조건 ─────────────────────────────

function hasCover(b: BattleState): boolean {
  for (let y = 0; y < b.h; y++)
    for (let x = 3; x <= 14; x++) {
      const t = tileAt(b, x, y)!.t;
      if (t === 'forest' || t === 'mountain') return true;
    }
  return false;
}

/** 방침을 고를 수 있는지. 안 되면 이유 */
export function policyCheck(b: BattleState, side: Side, id: PolicyId): { ok: boolean; reason?: string } {
  const p = POLICIES[id];
  if (p.side !== side) return { ok: false, reason: side === 'atk' ? '방어 방침입니다' : '공격 방침입니다' };
  const us = sideUnits(b, side);
  const n = us.length;
  const c = commanderOf(b, side);
  const a = advisorOf(b, side);
  switch (id) {
    case 'atk_pincer':
    case 'def_depth':
      if (n < 3) return { ok: false, reason: '부대가 3개 이상 필요합니다' };
      break;
    case 'atk_wedge':
      if (!us.some((u) => u.war >= 80 || u.lea >= 80)) return { ok: false, reason: '무력 또는 통솔 80 이상인 장수가 없습니다' };
      break;
    case 'atk_feint':
      if (Math.max(c?.int ?? 0, a?.int ?? 0) < 70) return { ok: false, reason: '총대장이나 군사의 지력이 70 이상이어야 합니다' };
      break;
    case 'atk_lure':
      if (n < 2) return { ok: false, reason: '부대가 2개 이상 필요합니다' };
      if (!hasCover(b)) return { ok: false, reason: '전장에 숨을 숲·산이 없습니다' };
      break;
    case 'atk_fire':
      if (b.weather === 'rain') return { ok: false, reason: '비가 와서 불을 놓을 수 없습니다' };
      if (!us.some((u) => u.int >= 70 || u.skills.includes('fire'))) return { ok: false, reason: '지력 70 이상이거나 화계 특기를 가진 장수가 없습니다' };
      break;
    case 'def_counter':
      if (n < 3) return { ok: false, reason: '부대가 3개 이상 필요합니다' };
      if ((c?.int ?? 0) < 70 && (a?.int ?? 0) < 70) return { ok: false, reason: '지력 70 이상인 지휘관이 없습니다' };
      break;
    case 'def_ambush':
      if (!hasCover(b)) return { ok: false, reason: '전장에 숨을 숲·산이 없습니다' };
      break;
  }
  return { ok: true };
}

// ───────────────────────────── 기본 작전 (1단만 골라도 나머지 자동) ─────────────────────────────

/** 역할 자동 배정: 총대장 = 중군, 무력+통솔 최고 = 선봉, 기병 우선 양익, 나머지 예비대 */
export function assignRoles(b: BattleState, side: Side): Record<string, Role> {
  const us = sideUnits(b, side);
  const out: Record<string, Role> = {};
  if (!us.length) return out;
  const cmd = commanderOf(b, side)!;
  out[cmd.id] = 'main';
  const rest = us.filter((u) => u !== cmd);
  const byPower = [...rest].sort((a, c) => c.war + c.lea - (a.war + a.lea));
  const van = byPower[0];
  if (van) out[van.id] = 'vanguard';
  const wingCands = rest.filter((u) => u !== van).sort((a, c) => (c.kind === 'cavalry' ? 1 : 0) - (a.kind === 'cavalry' ? 1 : 0) || c.lea - a.lea);
  const order: Role[] = ['left', 'right', 'reserve'];
  wingCands.forEach((u, i) => {
    out[u.id] = order[i] ?? (i % 2 === 0 ? 'reserve' : 'main');
  });
  return out;
}

/** 일기토 방침 기본값: 무력 80+ 적극, 65+ 수락, 그 아래는 거절 (v2 설계서 9-2) */
export function defaultDuelPolicy(war: number): DuelPolicy {
  return war >= 80 ? 'seek' : war >= 65 ? 'accept' : 'refuse';
}

export function defaultPlan(b: BattleState, side: Side, policy: PolicyId, byAi = false): SidePlan {
  const p = POLICIES[policy];
  const roles = assignRoles(b, side);
  const units: Record<string, UnitPlan> = {};
  for (const [id, role] of Object.entries(roles))
    units[id] = { role, stance: p.stance[role], retreatAt: p.retreatAt, duel: defaultDuelPolicy(b.units.find((u) => u.id === id)?.war ?? 0) };
  return {
    policy,
    units,
    commander: commanderOf(b, side)?.id ?? '',
    advisor: advisorOf(b, side)?.id ?? null,
    execution: executionOf(b, side),
    byAi,
  };
}

/** 방침을 바꿀 때: 역할은 그대로 두고 태도·퇴각 기준만 새 방침 기본값으로 */
export function switchPolicy(plan: SidePlan, policy: PolicyId): SidePlan {
  const p = POLICIES[policy];
  const units: Record<string, UnitPlan> = {};
  for (const [id, up] of Object.entries(plan.units)) units[id] = { ...up, stance: p.stance[up.role], retreatAt: p.retreatAt };
  return { ...plan, policy, units };
}

// ───────────────────────────── AI 작전 선택 ─────────────────────────────

/**
 * AI는 정찰이 없으므로(1단계) 상대 방침을 모른다. 고를 수 있는 방침 중 실행도에 맞는 것을
 * 가중치로 무작위 선택한다. 실행도가 모자란 방침은 덜 고른다.
 */
export function aiChoosePolicy(b: BattleState, side: Side, roll: () => number): PolicyId {
  const list = side === 'atk' ? ATK_POLICIES : DEF_POLICIES;
  const ex = executionOf(b, side);
  const cands = list
    .filter((id) => policyCheck(b, side, id).ok)
    .map((id) => {
      const f = execFactor(ex, POLICIES[id].reqExec);
      return { id, w: f >= 1 ? 1 : f > 0 ? 0.35 : 0.05 };
    });
  if (!cands.length) return side === 'atk' ? 'atk_front' : 'def_hold';
  const total = cands.reduce((s, c) => s + c.w, 0);
  let r = roll() * total;
  for (const c of cands) {
    r -= c.w;
    if (r <= 0) return c.id;
  }
  return cands[cands.length - 1]!.id;
}

// ───────────────────────────── 전투 보정 ─────────────────────────────

/** 공격 측 관점 상성 값 (화공은 비가 오면 효과 절반) */
export function matchupValue(b: BattleState): number {
  const a = b.plans?.atk?.policy as AtkPolicy | undefined;
  const d = b.plans?.def?.policy as DefPolicy | undefined;
  if (!a || !d) return 0;
  let v = MATCHUP[a]?.[d] ?? 0;
  if (a === 'atk_fire' && b.weather === 'rain' && v > 0) v /= 2;
  return v;
}

export function sideExecFactor(b: BattleState, side: Side): number {
  const p = b.plans?.[side];
  if (!p) return 1;
  return execFactor(p.execution, POLICIES[p.policy].reqExec);
}

const STANCE_DEALT: Record<Stance, number> = { aggressive: 1.15, balanced: 1, cautious: 0.9 };
const STANCE_TAKEN: Record<Stance, number> = { aggressive: 1.15, balanced: 1, cautious: 0.9 };

export function unitPlan(b: BattleState, u: BUnit): UnitPlan | undefined {
  return b.plans?.[u.side]?.units[u.id];
}

/**
 * 작전에 따른 피해 배율 (공격자 a → 피격자 d).
 * - 상성: 유리한 쪽이 주는 피해 × (1 + 상성 × 실행 계수)
 * - 실행도가 크게 모자라면(계수 음수) 그쪽이 주는 피해가 줄어든다 (따로 논다)
 * - 태도: 공격은 주고받는 피해 +15%, 신중은 -10%
 * - 매복 기습: 숨어 있다 덮친 직후 ×1.4
 * - 견고 수비: 배치 자리 근처에서 받는 피해 -10%
 */
export function planDamageMult(b: BattleState, a: BUnit, d: BUnit): number {
  if (!b.plans || !b.started) return 1;
  let m = 1;
  const v = matchupValue(b);
  const fav: Side | null = v > 0 ? 'atk' : v < 0 ? 'def' : null;
  const fa = sideExecFactor(b, a.side);
  if (fav === a.side && fa > 0) m *= 1 + Math.abs(v) * fa;
  if (fa < 0) m *= 1 + 0.25 * fa;
  const pa = unitPlan(b, a);
  const pd = unitPlan(b, d);
  const pol = b.plans[a.side]?.policy;
  if (pol) m *= 1 + (POLICIES[pol].power ?? 0);
  if (pa) m *= STANCE_DEALT[pa.stance];
  if (pd) m *= STANCE_TAKEN[pd.stance];
  if ((a.ambushTicks ?? 0) > 0) m *= 1.4;
  if (b.plans.def?.policy === 'def_hold' && d.side === 'def' && d.anchor && Math.max(Math.abs(d.x - d.anchor.x), Math.abs(d.y - d.anchor.y)) <= 1) m *= 0.9;
  return m;
}

/** 작전 기록 요약 문장 (보고서용) */
export function planSummary(b: BattleState, side: Side): string {
  const p = b.plans?.[side];
  if (!p) return '';
  const f = sideExecFactor(b, side);
  const ex = f >= 1 ? '작전대로 움직였다' : f > 0 ? '작전이 다소 엉성했다' : '부대들이 따로 놀았다';
  return `${POLICIES[p.policy].name} (실행도 ${p.execution} / 요구 ${POLICIES[p.policy].reqExec} · ${ex})`;
}

