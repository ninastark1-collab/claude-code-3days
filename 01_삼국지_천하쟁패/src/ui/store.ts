import { create } from 'zustand';
import { campOf, eraLabel } from '../data/eras';
import { loadGameData } from '../data/gameData';
import type { GameData } from '../data/validate';
import { battleAi } from '../engine/battle/ai';
import { stepBattle } from '../engine/battle/battle';
import { tickPlanned } from '../engine/battle/auto';
import type { BattleState, UnitKind } from '../engine/battle/types';
import type { Result } from '../engine/commands';
import { indexData, makeGame, type DataIndex, type Game } from '../engine/ctx';
import { SLOT_LABEL, autoSave, loadGame, saveGame, suspendSave, type SlotId } from '../engine/save';
import { createGameState, type BattleSetup, type Difficulty } from '../engine/state';
import { checkEnding, finishMonth, runAiPhase, triageMessages } from '../engine/turn';
import { applyBattleResult, refreshSetup, resolveAttackAuto, startBattle } from '../engine/war';
import { sfx } from './sound';

export type Screen = 'title' | 'newgame' | 'lord' | 'strategy' | 'battle' | 'ending' | 'scene3d';

/** 전략 화면 위에 겹치는 화면 */
export type Overlay =
  | { kind: 'officers'; city?: string } // S08
  | { kind: 'officer'; id: string; back?: Overlay } // S09
  | { kind: 'diplomacy'; city?: string } // S10
  | { kind: 'city3d'; id: string } // 내정 3D 도시
  | { kind: 'chronicle' } // S16
  | { kind: 'settings' } // S17
  | { kind: 'factions' }; // 세력 개요

export interface Toast {
  id: number;
  text: string;
  ok: boolean;
}

/** S07 턴 보고: 긴급·중요는 모달, 정보는 접어 둔다 */
export interface ReportItem {
  text: string;
  /** "그 도시 보기" 버튼용 */
  city?: string;
}
export interface Report {
  title: string;
  sub: string;
  urgent: ReportItem[];
  important: ReportItem[];
  info: string[];
}

interface Store {
  data: GameData;
  ix: DataIndex;
  screen: Screen;
  g: Game | null;
  /** 엔진이 상태를 직접 바꾸므로 렌더링 갱신용 카운터 */
  rev: number;
  selectedCity: string | null;
  battle: BattleState | null;
  /** 플레이어가 공격한 전투인지 (끝나면 같은 달로 복귀) */
  battleIsDefense: boolean;
  /** 플레이어 방어전 대기 (직접 지휘/위임 선택) */
  incoming: BattleSetup | null;
  toasts: Toast[];
  busy: boolean;
  overlay: Overlay | null;
  report: Report | null;
  /** S02에서 고른 시나리오 (S03 군주 선택으로 넘김) */
  scenarioId: string;
  /** 지도를 이 도시로 옮기라는 요청 */
  focus: { city: string; nonce: number } | null;

  go(screen: Screen): void;
  open(o: Overlay | null): void;
  focusCity(id: string): void;
  closeReport(): void;
  pickScenario(id: string): void;
  bump(): void;
  toast(text: string, ok?: boolean): void;
  /** quiet: 결과 알림(토스트)을 띄우지 않는다 (사신 연출처럼 화면이 결과를 직접 보여 줄 때) */
  run(fn: (g: Game) => Result, quiet?: boolean): Result;
  selectCity(id: string | null): void;
  newGame(scenario: string, faction: string, historical: boolean, difficulty: Difficulty): void;
  /** 성공하면 null, 실패하면 안내 문구 */
  load(slot: SlotId): Promise<string | null>;
  save(slot: SlotId): Promise<void>;
  endTurn(): void;
  attack(setup: BattleSetup, kinds: Record<string, UnitKind>): void;
  /** kinds: 직접 지휘할 때 수비 부대 병과 (없으면 자동) */
  commandIncoming(direct: boolean, kinds?: Record<string, UnitKind>): void;
  finishBattle(): void;
  quitToTitle(): void;
}

const data = loadGameData();
const ix = indexData(data);
let toastSeq = 1;

export const useStore = create<Store>((set, get) => ({
  data,
  ix,
  // 주소 끝 #scene3d 로 3D 확인 화면을 바로 연다 (개발·디자인 확인용)
  screen: typeof location !== 'undefined' && location.hash === '#scene3d' ? 'scene3d' : 'title',
  g: null,
  rev: 0,
  selectedCity: null,
  battle: null,
  battleIsDefense: false,
  incoming: null,
  toasts: [],
  busy: false,
  overlay: null,
  report: null,
  scenarioId: data.scenarios[0]!.id,
  focus: null,

  go: (screen) => set({ screen }),
  open: (o) => set({ overlay: o }),
  focusCity: (id) => set({ selectedCity: id, focus: { city: id, nonce: Date.now() }, overlay: null }),
  closeReport: () => set({ report: null }),
  pickScenario: (id) => set({ scenarioId: id, screen: 'lord' }),
  bump: () => {
    // 상태가 바뀔 때마다 알림 등급 정리 (17-3): 긴급(전쟁)·중요(조약·출분 등)는 S07 보고로 모으고, 역사 이벤트는 S11 장면으로 남긴다
    const g = get().g;
    if (g) {
      triageMessages(g);
      const urgent = g.s.messages.filter((m) => m.kind === 'war');
      const notices = g.s.notices ?? [];
      if (urgent.length || notices.length) {
        g.s.messages = g.s.messages.filter((m) => m.kind !== 'war');
        g.s.notices = [];
        const r = get().report ?? { title: '전황', sub: '', urgent: [], important: [], info: [] };
        set({
          report: {
            ...r,
            urgent: [...r.urgent, ...urgent.map((m) => ({ text: `${m.title} · ${m.text}`, city: cityIn(m.text) }))],
            important: [...r.important, ...notices.map((t) => ({ text: t, city: cityIn(t) }))],
          },
        });
      }
    }
    set((s) => ({ rev: s.rev + 1 }));
  },
  toast: (text, ok = true) => {
    const id = toastSeq++;
    set((s) => ({ toasts: [...s.toasts.slice(-3), { id, text, ok }] }));
    setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), 2500);
  },
  run: (fn, quiet) => {
    const g = get().g;
    if (!g) return { ok: false, msg: '게임이 없습니다.' };
    const r = fn(g);
    if (!quiet || !r.ok) get().toast(r.msg, r.ok);
    sfx(r.ok ? 'ok' : 'ng');
    get().bump();
    checkMidMonthEnding();
    return r;
  },
  selectCity: (id) => set({ selectedCity: id }),

  newGame: (scenario, faction, historical, difficulty) => {
    const state = createGameState(data, scenario, faction, { seed: (Date.now() & 0x7fffffff) | 1, historicalEvents: historical, difficulty });
    const g = makeGame(ix, state);
    const cap = state.factions[faction]!.capital;
    set({ g, screen: 'strategy', selectedCity: null, focus: { city: cap, nonce: Date.now() }, battle: null, incoming: null, overlay: null, report: null });
    get().bump();
  },
  load: async (slot) => {
    const r = await loadGame(slot);
    if (!r.ok) return r.error;
    const { state, battle } = r.payload;
    set({
      g: makeGame(ix, state),
      screen: battle ? 'battle' : state.ending ? 'ending' : 'strategy',
      selectedCity: null,
      focus: { city: state.factions[state.playerFaction]?.capital ?? Object.keys(state.cities)[0]!, nonce: Date.now() },
      battle: battle?.state ?? null,
      battleIsDefense: battle?.isDefense ?? false,
      incoming: null,
      overlay: null,
      report: null,
    });
    get().bump();
    return null;
  },
  save: async (slot) => {
    const g = get().g;
    if (!g) return;
    const b = get().battle;
    try {
      await saveGame(g.s, slot, g.s.factions[g.s.playerFaction]!.name, b ? { state: b, isDefense: get().battleIsDefense } : undefined);
      get().toast(`${SLOT_LABEL[slot]}에 저장했습니다.`);
    } catch (e) {
      get().toast(`저장 실패: ${String(e)}`, false);
    }
  },

  endTurn: () => {
    const g = get().g;
    if (!g || get().busy) return;
    set({ busy: true, selectedCity: null, overlay: null });
    monthStart = { gold: playerGold(g), logLen: g.s.log.length };
    // 화면이 멈춘 듯 보이지 않도록 다음 프레임에 처리
    setTimeout(() => {
      runAiPhase(g);
      set({ busy: false });
      processPending();
    }, 30);
  },

  attack: (setup, kinds) => {
    const g = get().g!;
    const b = startBattle(g, setup, 'atk', kinds);
    if (!b) {
      get().toast('수비군이 없어 무혈입성했습니다!');
      sfx('win');
      get().bump();
      checkMidMonthEnding();
      return;
    }
    sfx('battle');
    set({ battle: b, battleIsDefense: false, screen: 'battle' });
  },

  commandIncoming: (direct, kinds) => {
    const g = get().g!;
    const setup = get().incoming;
    if (!setup) return;
    set({ incoming: null });
    if (direct) {
      const b = startBattle(g, setup, 'def', kinds);
      if (b) {
        sfx('battle');
        set({ battle: b, battleIsDefense: true, screen: 'battle' });
        return;
      }
    } else {
      resolveAttackAuto(g, setup);
    }
    get().bump();
    processPending();
  },

  finishBattle: () => {
    const g = get().g!;
    const b = get().battle;
    if (!b?.result) return;
    applyBattleResult(g, b);
    const defense = get().battleIsDefense;
    set({ battle: null, screen: 'strategy' });
    get().bump();
    if (defense) processPending();
    else checkMidMonthEnding();
  },

  quitToTitle: () => set({ screen: 'title', g: null, battle: null, incoming: null, overlay: null, report: null }),
}));

let monthStart = { gold: 0, logLen: 0 };

function playerGold(g: Game): number {
  return Object.values(g.s.cities)
    .filter((c) => c.faction === g.s.playerFaction)
    .reduce((s, c) => s + c.gold, 0);
}

/** 알림 문장에서 도시 이름을 찾아 "그곳 보기" 버튼에 쓴다 */
function cityIn(text: string): string | undefined {
  let best: { id: string; len: number } | undefined;
  for (const c of data.cities) if (text.includes(c.name) && (!best || c.name.length > best.len)) best = { id: c.id, len: c.name.length };
  return best?.id;
}

const SEASON = (m: number) => (m <= 3 ? '봄' : m <= 6 ? '여름' : m <= 9 ? '가을' : '겨울');

/** 쌓인 방어전을 하나씩 처리, 다 끝나면 월말 정산 */
function processPending(): void {
  const st = useStore.getState();
  const g = st.g!;
  while (g.s.pendingBattles.length) {
    const setup = refreshSetup(g, g.s.pendingBattles.shift()!);
    if (!setup) continue;
    // 앞선 공격으로 이미 도시를 잃었다면 더 이상 플레이어의 방어전이 아니다
    if (setup.defender !== g.s.playerFaction) {
      resolveAttackAuto(g, setup);
      continue;
    }
    {
      useStore.setState({ incoming: setup });
      // 경보는 BGM 감독의 st_alarm 이 맡는다 (음향_BGM_큐시트 2장 ③)
      st.bump();
      return;
    }
  }
  finishMonth(g);
  // 패망한 상태를 자동 저장으로 덮어쓰지 않는다 (이전 달에서 다시 할 수 있도록)
  if (!g.s.ending) {
    autoSave(g.s, g.s.factions[g.s.playerFaction]!.name).catch((e) => st.toast(`자동 저장 실패: ${String(e)}`, false));
  }
  // S07 턴 보고: 새 달 제목 + 이번 달 금 변화 + 정보 등급(기록) 묶음. 긴급·중요는 bump()가 채운다
  const delta = playerGold(g) - monthStart.gold;
  const prev = useStore.getState().report;
  useStore.setState({
    screen: g.s.ending ? 'ending' : 'strategy',
    report: {
      title: `${eraLabel(g.s.year, campOf(g.s.playerFaction, g.s.factions[g.s.playerFaction]!.ruler))} ${g.s.month === 1 ? '정' : g.s.month}월`,
      sub: `${SEASON(g.s.month)} · 금 ${delta >= 0 ? '+' : ''}${delta.toLocaleString('ko-KR')}`,
      urgent: prev?.urgent ?? [],
      important: prev?.important ?? [],
      info: g.s.log.slice(monthStart.logLen).map((l) => l.text),
    },
  });
  st.bump();
}

/** 달 중간에 천하통일/멸망이 결정됐는지 확인 (플레이어 전투·항복 권고 직후) */
function checkMidMonthEnding(): void {
  const g = useStore.getState().g;
  if (!g) return;
  checkEnding(g);
  if (g.s.ending) useStore.setState({ screen: 'ending' });
}

/** 전투 화면 루프에서 호출: n틱 진행 */
export function advanceBattle(b: BattleState, ticks: number, autoPlayer: boolean): void {
  // 작전 자동 전투: 작전대로만 움직인다 (개입 없음)
  if (b.auto) return tickPlanned(b, ticks);
  for (let i = 0; i < ticks && !b.result; i++) {
    const sides: ('atk' | 'def')[] = autoPlayer || !b.playerSide ? ['atk', 'def'] : [b.playerSide === 'atk' ? 'def' : 'atk'];
    battleAi(b, sides);
    stepBattle(b);
  }
}

/**
 * 앱을 내리거나(홈 버튼·전화·알림) 창을 닫을 때 지금 상태를 자동 저장 칸에 남긴다 (QA-DEV-03).
 * 월말 처리 중(busy)이거나 방어전 선택(incoming)을 기다리는 중에는 상태가 반쯤 진행된 것이라 저장하지 않는다.
 * 그 경우는 직전 월말 자동 저장에서 이어진다.
 */
export function saveOnSuspend(): Promise<unknown> | null {
  const st = useStore.getState();
  const g = st.g;
  if (!g || g.s.ending || st.busy || st.incoming) return null;
  const b = st.battle;
  if (b?.result) return null; // 결과 적용 전 전투는 저장하지 않는다 (결과 화면에서 이어 처리)
  return suspendSave(g.s, g.s.factions[g.s.playerFaction]!.name, b ? { state: b, isDefense: st.battleIsDefense } : undefined).catch(
    () => undefined,
  );
}

export function installSuspendSave(): void {
  if (typeof document === 'undefined') return;
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') saveOnSuspend();
  });
  window.addEventListener('pagehide', () => saveOnSuspend());
}

/**
 * 안드로이드 뒤로 가기 (QA-DEV-08): 열린 창을 닫고, 새 게임 단계는 한 단계 뒤로, 진행 중에는 설정(메뉴)을 연다.
 * 타이틀에서만 false → 앱 종료. 전투 중에는 아무것도 하지 않는다 (실수로 전투를 벗어나지 않게).
 */
export function handleBack(): boolean {
  const st = useStore.getState();
  if (st.overlay) {
    st.open(null);
    return true;
  }
  switch (st.screen) {
    case 'title':
      return false;
    case 'newgame':
      st.go('title');
      return true;
    case 'lord':
      st.go('newgame');
      return true;
    case 'strategy':
      st.open({ kind: 'settings' });
      return true;
    default:
      return true;
  }
}
