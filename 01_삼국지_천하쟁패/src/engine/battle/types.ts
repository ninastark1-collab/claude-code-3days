import type { BattleSetup } from '../state';

export type Terrain = 'plain' | 'forest' | 'mountain' | 'river' | 'water' | 'bridge' | 'wall' | 'gate' | 'town' | 'keep';
export type UnitKind = 'infantry' | 'cavalry' | 'archer';
export type Side = 'atk' | 'def';
export type Weather = 'clear' | 'cloudy' | 'rain';

export interface Tile {
  t: Terrain;
  /** 성벽/성문 내구도 */
  hp?: number;
  /** 남은 화염 틱 */
  fire?: number;
}

export type Order =
  | { type: 'hold' }
  | { type: 'move'; x: number; y: number }
  | { type: 'attack'; target: string }
  | { type: 'siege'; x: number; y: number }
  | { type: 'retreat' };

export interface BUnit {
  id: string;
  officer: string;
  name: string;
  side: Side;
  faction: string | null;
  kind: UnitKind;
  troops: number;
  startTroops: number;
  training: number;
  morale: number;
  x: number;
  y: number;
  /** 이동 포인트 누적 */
  mp: number;
  /** 다음 공격까지 남은 틱 */
  atkCd: number;
  /** 다음 계략까지 남은 틱 */
  tacCd: number;
  confused: number;
  /** 혼란이 풀린 뒤 다시 혼란에 걸리지 않는 남은 틱 (38장 안전핀) */
  confImmune?: number;
  order: Order;
  status: 'active' | 'routed' | 'captured' | 'dead' | 'retreated';
  // 무장 능력 (전투 중 자주 쓰므로 복사)
  lea: number;
  war: number;
  int: number;
  cha: number;
  skills: string[];
  /** 이 부대가 받은 일기토 신청 여부 (한 전투에 한 번) */
  dueled?: boolean;
  /** 병과를 자동으로 정했는지 (플레이어가 고르지 않음). 작전이 정해지면 싸움 형태에 맞게 다시 배정된다 */
  autoKind?: boolean;
  /** 충차대: 성문 피해 3배, 이동 느림, 성벽 위 궁병에게 피해 +50% (공격·성 자동 배정) */
  ram?: boolean;
  // ── 작전 자동 전투 (전투개편 1단계) ──
  /** 매복 중 (적에게 보이지 않고 공격받지 않음) */
  hidden?: boolean;
  /** 매복 기습 효과가 남은 틱 */
  ambushTicks?: number;
  /** 지금까지 적에게 입힌 병력 피해 (보고서용) */
  dealt?: number;
  /** 방침 진행 단계 (부대별 상태 기계) */
  phase?: number;
  /** 적과 맞붙어 있던 틱 수 (지연전 후퇴 판단) */
  engaged?: number;
  /** 배치 기준점 */
  anchor?: { x: number; y: number };
}

// ───────────────────────────── 작전 (전투개편 설계서) ─────────────────────────────

export type AtkPolicy = 'atk_front' | 'atk_pincer' | 'atk_wedge' | 'atk_feint' | 'atk_lure' | 'atk_fire';
export type DefPolicy = 'def_hold' | 'def_depth' | 'def_counter' | 'def_ambush' | 'def_sally' | 'def_delay';
export type PolicyId = AtkPolicy | DefPolicy;
/** 역할 5개: 선봉·중군·좌익·우익·예비대 */
export type Role = 'vanguard' | 'main' | 'left' | 'right' | 'reserve';
/** 태도 3단계 */
export type Stance = 'aggressive' | 'balanced' | 'cautious';

/** 장수별 일기토 방침 (v2 설계서 9-2): 적극 신청 / 받으면 수락 / 거절 */
export type DuelPolicy = 'seek' | 'accept' | 'refuse';

export interface UnitPlan {
  role: Role;
  stance: Stance;
  /** 병력이 처음의 이 비율 아래로 떨어지면 스스로 퇴각 (0 = 끝까지 싸움) */
  retreatAt: number;
  /** 일기토 방침 (없으면 무력으로 기본값) */
  duel?: DuelPolicy;
}

export interface SidePlan {
  policy: PolicyId;
  /** 부대 id → 설정 */
  units: Record<string, UnitPlan>;
  /** 총대장 부대 id */
  commander: string;
  /** 군사 부대 id (출진 장수 중 지력 최고) */
  advisor: string | null;
  /** 실행도 (작전 확정 시점 계산) */
  execution: number;
  /** AI가 정한 작전인지 */
  byAi?: boolean;
}

export interface DuelLog {
  a: string;
  b: string;
  rounds: { aHp: number; bHp: number; text: string }[];
  winner: string | null;
  outcome: string;
  // ── v2: 관전 화면 재생용 (옛 세이브에는 없을 수 있다) ──
  /** 신청한 쪽 / 받은 쪽 장수 id */
  aId?: string;
  bId?: string;
  aSide?: Side;
  aWar?: number;
  bWar?: number;
  aFaction?: string | null;
  bFaction?: string | null;
  /** 도전 대사 / 응답 대사 */
  lineA?: string;
  lineB?: string;
  /** 연의 매치업 출전 */
  source?: string;
  /** 진 쪽 결말 */
  fate?: 'dead' | 'captured' | 'routed' | 'draw';
  /** 사기 변화: 이긴 장수 부대, 진 쪽 전군 */
  moraleWin?: number;
  moraleLose?: number;
  tick?: number;
  day?: number;
}

/** 관전 화면이 전장을 멈추고 보여 줄 연출 (v2 설계서 10-2). 엔진이 쌓고 화면이 꺼내 쓴다 */
export type Cinematic =
  | { kind: 'duel'; duel: number }
  | { kind: 'banner'; text: string; tone: 'stratagem' | 'loss' | 'gain' | 'neutral'; side?: Side; x?: number; y?: number };

export interface BattleState {
  setup: BattleSetup;
  w: number;
  h: number;
  tiles: Tile[];
  units: BUnit[];
  tick: number;
  day: number;
  maxDays: number;
  weather: Weather;
  wind: [number, number];
  atkFood: number;
  defFood: number;
  keep: { x: number; y: number };
  /** 플레이어가 조작하는 쪽 (없으면 관전/자동) */
  playerSide: Side | null;
  rngState: number;
  /** 동남풍 등 화공 강화 */
  fireBoost: boolean;
  log: string[];
  duels: DuelLog[];
  /** 처음으로 부대끼리 공격을 주고받은 틱 (일기토는 이 뒤 DUEL_AFTER_CLASH 틱부터) */
  firstClash?: number;
  /** 관전 연출 큐 (일기토·복병·화공·장수 전사 등). 화면이 재생하면서 앞에서부터 꺼낸다 */
  cinematics?: Cinematic[];
  result?: BattleResult;
  cityName: string;
  /** 작전 자동 전투: 양쪽 작전. 있으면 부대는 작전대로만 움직인다 */
  plans?: Partial<Record<Side, SidePlan>>;
  /** 작전 자동 전투인지 (true면 직접 명령 없음) */
  auto?: boolean;
  /** 작전이 모두 확정되어 전투가 시작됐는지 */
  started?: boolean;
  /** 양쪽 총대장 후보 (공격: 첫 출진 장수, 방어: 태수) */
  leaders?: Partial<Record<Side, string>>;
}

export interface BattleResult {
  winner: Side;
  reason: string;
  /** 부대별 최종 상태 */
  units: { officer: string; side: Side; troops: number; status: BUnit['status'] }[];
  atkFoodLeft: number;
}

export const TICKS_PER_DAY = 12;

export const TERRAIN_NAME: Record<Terrain, string> = {
  plain: '평지',
  forest: '숲',
  mountain: '산',
  river: '강',
  water: '물',
  bridge: '다리',
  wall: '성벽',
  gate: '성문',
  town: '성내',
  keep: '본성',
};

export const KIND_NAME: Record<UnitKind, string> = { infantry: '창병', cavalry: '기병', archer: '궁병' };

/** 병종 상성 요약 (37장): 화면 표시용 */
export const KIND_MATCHUP: Record<UnitKind, { strong: UnitKind; weak: UnitKind }> = {
  infantry: { strong: 'cavalry', weak: 'archer' },
  cavalry: { strong: 'archer', weak: 'infantry' },
  archer: { strong: 'infantry', weak: 'cavalry' },
};

export function matchupText(k: UnitKind): string {
  const m = KIND_MATCHUP[k];
  return `${KIND_NAME[m.strong]}에 강함 ×1.3 · ${KIND_NAME[m.weak]}에 약함 ×0.8`;
}
