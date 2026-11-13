import type { GameData } from '../data/validate';
import type { Scenario } from '../data/schema';

export type OfficerStatus = 'unborn' | 'free' | 'serving' | 'captive' | 'dead';

/** 게임 진행 중 변하는 무장 상태 */
export interface OfficerState {
  id: string;
  /** 소속 세력. 포로일 때는 원래 소속, 재야/미등장/사망은 null */
  faction: string | null;
  city: string;
  status: OfficerStatus;
  troops: number;
  /** 훈련도 0~100 */
  training: number;
  loyalty: number;
  /** 이번 달 이미 명령을 수행했는지 */
  acted: boolean;
  /** 포로로 잡고 있는 세력 */
  captor?: string;
  /** 탐색으로 발견된 재야 무장인지 (발견되어야 등용 가능) */
  found?: boolean;
}

export interface CityState {
  id: string;
  faction: string | null;
  population: number;
  gold: number;
  food: number;
  agriculture: number;
  commerce: number;
  walls: number;
  order: number;
  support: number;
  governor: string | null;
}

export interface FactionState {
  id: string;
  name: string;
  ruler: string;
  color: string;
  capital: string;
  personality: Scenario['factions'][number]['personality'];
  alive: boolean;
  /** 천자를 옹립했는지 */
  emperor?: boolean;
}

export interface Relation {
  friendship: number;
  treaty: 'none' | 'alliance' | 'truce';
  /** 동맹/정전 남은 개월 */
  treatyMonths: number;
}

/** 출진 정보 (전투 시작 전) */
export interface BattleSetup {
  id: string;
  attacker: string;
  defender: string | null;
  from: string;
  city: string;
  units: { officer: string; troops: number }[];
  food: number;
  /** 동맹 협공 원군 (다른 세력 무장. 전투 뒤 자기 도시로 돌아간다) */
  allies?: { officer: string; troops: number; faction: string; from: string }[];
}

/** 동맹 협공 약속: by 세력이 city를 칠 때 ally 세력이 원군을 보낸다 (until = 연*12+월, 그 달까지 유효) */
export interface JointPact {
  by: string;
  ally: string;
  city: string;
  until: number;
}

/** UI에 띄울 대화/알림 */
export interface GameMessage {
  title: string;
  text: string;
  speaker?: string;
  /**
   * 알림 등급 (설계노트 17-3)
   * - war / ending / event: 팝업 (긴급·역사 이벤트)
   * - notice / death: 상단 알림(토스트) + 기록
   * - info: 기록만
   */
  kind?: 'event' | 'info' | 'notice' | 'war' | 'death' | 'ending';
}

/** AI → 플레이어 외교 제안 */
export interface Proposal {
  from: string;
  type: 'alliance' | 'truce' | 'surrender_demand';
  envoy: string;
}

export interface GameState {
  version: 1;
  scenarioId: string;
  year: number;
  month: number;
  playerFaction: string;
  rngState: number;
  officers: Record<string, OfficerState>;
  cities: Record<string, CityState>;
  factions: Record<string, FactionState>;
  /** key: 세력 id 두 개를 정렬해 '|'로 연결 */
  relations: Record<string, Relation>;
  /** 이벤트 진행 기록 등 */
  flags: Record<string, number | boolean | string>;
  log: { date: string; text: string }[];
  messages: GameMessage[];
  /** 팝업 대신 상단 알림으로 보여 줄 문구 (UI가 꺼내 쓰고 비움) */
  notices?: string[];
  proposals: Proposal[];
  /** 동맹 협공 약속 */
  pacts?: JointPact[];
  /** 플레이어가 직접 치러야 하는 방어전 */
  pendingBattles: BattleSetup[];
  ending?: { type: 'victory' | 'defeat'; text: string };
  /** 이번 시나리오에서 이벤트 연출 사용 여부 */
  historicalEvents: boolean;
  /** 난이도: AI 공격성·수입 보정 */
  difficulty?: Difficulty;
}

export type Difficulty = 'easy' | 'normal' | 'hard';
export const DIFFICULTY_NAME: Record<Difficulty, string> = { easy: '쉬움', normal: '보통', hard: '어려움' };
/** [AI 공격 판단 배율(클수록 신중), AI 수입 배율] */
export const DIFFICULTY_MOD: Record<Difficulty, { attack: number; income: number }> = {
  easy: { attack: 1.25, income: 0.8 },
  normal: { attack: 1, income: 1 },
  hard: { attack: 0.85, income: 1.25 },
};

export function relationKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

export interface NewGameOptions {
  seed: number;
  historicalEvents?: boolean;
  difficulty?: Difficulty;
}

/** 시나리오로부터 새 게임 상태 생성 */
export function createGameState(data: GameData, scenarioId: string, playerFaction: string, opts: NewGameOptions | number): GameState {
  const o = typeof opts === 'number' ? { seed: opts } : opts;
  const s = data.scenarios.find((x) => x.id === scenarioId);
  if (!s) throw new Error(`시나리오 없음: ${scenarioId}`);
  if (!s.factions.some((f) => f.id === playerFaction)) throw new Error(`세력 없음: ${playerFaction}`);

  const factions: Record<string, FactionState> = {};
  for (const f of s.factions) factions[f.id] = { ...f, alive: true };

  const cities: Record<string, CityState> = {};
  for (const c of s.cities) {
    const { city, ...rest } = c;
    cities[city] = { id: city, ...rest, governor: null };
  }

  const officers: Record<string, OfficerState> = {};
  for (const p of s.officers) {
    officers[p.officer] = {
      id: p.officer,
      faction: p.faction,
      city: p.city,
      status: p.faction ? 'serving' : 'free',
      troops: p.faction ? p.troops : 0,
      training: p.faction ? 60 : 0,
      loyalty: p.faction ? p.loyalty : 0,
      acted: false,
      found: p.faction ? undefined : false,
    };
  }
  // 시나리오에 배치되지 않은 무장: 이미 사망 / 이미 등장 연도가 지났으면 고향에 재야로 / 아직 등장 전
  for (const b of data.officers) {
    if (officers[b.id]) continue;
    const status = b.deathYear < s.year ? 'dead' : b.debutYear <= s.year && b.homeCity && cities[b.homeCity] ? 'free' : 'unborn';
    officers[b.id] = {
      id: b.id,
      faction: null,
      city: b.homeCity ?? '',
      status,
      troops: 0,
      training: 0,
      loyalty: 0,
      acted: false,
      ...(status === 'free' ? { found: false } : {}),
    };
  }

  const state: GameState = {
    version: 1,
    scenarioId,
    year: s.year,
    month: s.month,
    playerFaction,
    rngState: o.seed | 0,
    officers,
    cities,
    factions,
    relations: {},
    flags: {},
    log: [],
    messages: [{ title: s.name, text: s.description, kind: 'event' }],
    proposals: [],
    pendingBattles: [],
    historicalEvents: o.historicalEvents ?? true,
    difficulty: o.difficulty ?? 'normal',
  };

  for (const c of Object.values(cities)) assignGovernor(state, c.id);

  const ids = s.factions.map((f) => f.id);
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      state.relations[relationKey(ids[i]!, ids[j]!)] = { friendship: 50, treaty: 'none', treatyMonths: 0 };
    }
  }
  for (const r of s.relations) {
    state.relations[relationKey(r.a, r.b)] = {
      friendship: r.friendship,
      treaty: r.treaty,
      treatyMonths: r.treaty === 'none' ? 0 : 12,
    };
  }
  state.log.push({ date: `${s.year}.${s.month}`, text: `${s.name} 시작` });
  return state;
}

/** 도시의 태수를 정한다: 군주 > 기존 태수 유지 > 그 도시에 있는 첫 무장 */
export function assignGovernor(state: GameState, cityId: string): void {
  const c = state.cities[cityId];
  if (!c) return;
  if (!c.faction) {
    c.governor = null;
    return;
  }
  const here = Object.values(state.officers).filter((o) => o.status === 'serving' && o.city === cityId && o.faction === c.faction);
  pickGovernor(state, c, here);
}

function pickGovernor(state: GameState, c: CityState, here: OfficerState[]): void {
  if (!c.faction) {
    c.governor = null;
    return;
  }
  const ruler = state.factions[c.faction]?.ruler;
  if (ruler && here.some((o) => o.id === ruler)) c.governor = ruler;
  else if (c.governor && here.some((o) => o.id === c.governor)) return;
  else c.governor = here[0]?.id ?? null;
}

/** 모든 도시 태수 재검증 (무장 이동/포로/사망 후). 무장 목록을 한 번만 훑는다 */
export function refreshGovernors(state: GameState): void {
  const byCity = new Map<string, OfficerState[]>();
  for (const o of Object.values(state.officers)) {
    if (o.status !== 'serving' || state.cities[o.city]?.faction !== o.faction) continue;
    let list = byCity.get(o.city);
    if (!list) byCity.set(o.city, (list = []));
    list.push(o);
  }
  for (const c of Object.values(state.cities)) pickGovernor(state, c, byCity.get(c.id) ?? []);
}

export function getRelation(state: GameState, a: string, b: string): Relation {
  const k = relationKey(a, b);
  let r = state.relations[k];
  if (!r) r = state.relations[k] = { friendship: 50, treaty: 'none', treatyMonths: 0 };
  return r;
}

export function dateStr(state: GameState): string {
  return `${state.year}년 ${state.month}월`;
}

export function addLog(state: GameState, text: string): void {
  state.log.push({ date: `${state.year}.${state.month}`, text });
  if (state.log.length > 400) state.log.splice(0, state.log.length - 400);
}
