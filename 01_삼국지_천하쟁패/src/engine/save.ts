import { preparePlannedBattle } from './battle/auto';
import type { BattleState } from './battle/types';
import type { GameState } from './state';
import { validateSaveState } from './saveSchema';

/**
 * 세이브/로드.
 * - 설치판(Electron): %APPDATA%\삼국지 천하쟁패\saves\<슬롯>.json 파일 (임시 파일 → 이름 바꾸기로 원자적 저장)
 * - 개발용 웹/테스트: localStorage 또는 메모리
 * - 세이브마다 saveVersion이 있고, 옛 버전은 MIGRATIONS로 변환, 새 버전은 안내 메시지
 * - 자동 저장은 auto1~3을 돌아가며 가장 오래된 칸에 쓴다 (최신이 깨져도 이전 칸으로 복구)
 */

/** 세이브 형식 버전. 저장 구조가 바뀌면 올리고 MIGRATIONS에 변환 함수를 추가한다 */
export const SAVE_VERSION = 3;

export const AUTO_SLOTS = ['auto1', 'auto2', 'auto3'] as const;
export const MANUAL_SLOTS = ['slot1', 'slot2', 'slot3'] as const;
export type SlotId = (typeof AUTO_SLOTS)[number] | (typeof MANUAL_SLOTS)[number];
export const SLOT_LABEL: Record<SlotId, string> = {
  auto1: '자동 저장 1',
  auto2: '자동 저장 2',
  auto3: '자동 저장 3',
  slot1: '슬롯 1',
  slot2: '슬롯 2',
  slot3: '슬롯 3',
};

export interface SaveMeta {
  slot: SlotId;
  date: string;
  label: string;
  savedAt: number;
  inBattle?: boolean;
  /** 저장 당시 플레이어 도시 수 (덮어쓰기 확인창 요약용) */
  cities?: number;
}

export interface SavedBattle {
  state: BattleState;
  isDefense: boolean;
}

export interface SavePayload {
  format: 'samgukji-save';
  saveVersion: number;
  meta: SaveMeta;
  state: GameState;
  battle?: SavedBattle;
}

export type LoadResult = { ok: true; payload: SavePayload } | { ok: false; error: string };

// ───────────────────────────── 저장소 ─────────────────────────────

interface Backend {
  read(name: string): Promise<string | null>;
  write(name: string, text: string): Promise<void>;
  remove(name: string): Promise<void>;
}

interface SaveApi {
  read(name: string): Promise<string | null>;
  write(name: string, text: string): Promise<boolean>;
  remove(name: string): Promise<boolean>;
  dir(): Promise<string>;
}

const memory = new Map<string, string>();
let override: Backend | null = null;

/** 테스트용: 저장소 바꿔 끼우기 */
export function setSaveBackend(b: Backend | null): void {
  override = b;
}

function saveApi(): SaveApi | undefined {
  return (globalThis as { saveApi?: SaveApi }).saveApi;
}

function backend(): Backend {
  if (override) return override;
  const api = saveApi();
  if (api) {
    return {
      read: (n) => api.read(n),
      write: async (n, t) => void (await api.write(n, t)),
      remove: async (n) => void (await api.remove(n)),
    };
  }
  if (typeof localStorage !== 'undefined') {
    return {
      read: async (n) => localStorage.getItem(`samgukji.v2.${n}`),
      write: async (n, t) => localStorage.setItem(`samgukji.v2.${n}`, t),
      remove: async (n) => localStorage.removeItem(`samgukji.v2.${n}`),
    };
  }
  return {
    read: async (n) => memory.get(n) ?? null,
    write: async (n, t) => void memory.set(n, t),
    remove: async (n) => void memory.delete(n),
  };
}

/** 세이브 폴더 경로 (설치판에서만) */
export async function saveLocation(): Promise<string | null> {
  return saveApi()?.dir() ?? null;
}

// ───────────────────────────── 버전 변환 ─────────────────────────────

/** from 버전 → from+1 버전 변환 */
const MIGRATIONS: Record<number, (p: SavePayload) => SavePayload> = {
  // v1: localStorage 시절 형식 {meta, state}. 난이도 필드가 없었다.
  1: (p) => {
    p.state.difficulty ??= 'normal';
    return { ...p, saveVersion: 2 };
  },
  // v2: 직접 조작 전투 시절. 진행 중이던 전투는 양쪽 모두 AI 작전으로 이어서 자동 진행한다 (전투개편 1단계)
  2: (p) => {
    const b = p.battle?.state;
    if (b && !b.plans) {
      preparePlannedBattle(b, ['atk', 'def']);
      b.started = true;
      b.log.push('(이전 버전 세이브: 남은 전투는 군사가 정한 작전으로 자동 진행합니다)');
    }
    return { ...p, saveVersion: 3 };
  },
};

export function parseSave(text: string): LoadResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: '세이브 파일이 손상되어 읽을 수 없습니다.' };
  }
  const obj = raw as Partial<SavePayload> & { state?: GameState };
  if (!obj || typeof obj !== 'object' || !obj.state) return { ok: false, error: '세이브 파일 형식이 아닙니다.' };
  let p: SavePayload =
    obj.format === 'samgukji-save'
      ? (obj as SavePayload)
      : // 버전 필드 없는 옛 형식 = v1
        { format: 'samgukji-save', saveVersion: 1, meta: obj.meta as SaveMeta, state: obj.state };
  if (p.saveVersion > SAVE_VERSION) {
    return {
      ok: false,
      error: `더 새로운 버전의 게임에서 만든 세이브입니다 (세이브 v${p.saveVersion}, 게임 v${SAVE_VERSION}). 게임을 업데이트한 뒤 불러오세요.`,
    };
  }
  while (p.saveVersion < SAVE_VERSION) {
    const m = MIGRATIONS[p.saveVersion];
    if (!m) return { ok: false, error: `세이브 v${p.saveVersion}을(를) 변환할 수 없습니다.` };
    try {
      p = m(p);
    } catch {
      return { ok: false, error: '세이브 파일이 손상되었습니다. (버전 변환 실패)' };
    }
  }
  // 필수 필드 검증 (QA-DEV-04): 빠진 세이브를 받아들이면 진행 중 예외로 멈춘다
  const bad = validateSaveState(p.state, p.battle);
  if (bad) return { ok: false, error: `세이브 파일이 손상되었습니다. (${bad})` };
  return { ok: true, payload: p };
}

// ───────────────────────────── 저장 / 불러오기 ─────────────────────────────

export async function saveGame(state: GameState, slot: SlotId, label: string, battle?: SavedBattle): Promise<void> {
  const payload: SavePayload = {
    format: 'samgukji-save',
    saveVersion: SAVE_VERSION,
    meta: {
      slot,
      date: `${state.year}년 ${state.month}월`,
      label,
      savedAt: Date.now(),
      inBattle: !!battle,
      cities: Object.values(state.cities).filter((c) => c.faction === state.playerFaction).length,
    },
    state,
    ...(battle ? { battle } : {}),
  };
  await backend().write(slot, JSON.stringify(payload));
}

/** 자동 저장: 3칸 중 가장 오래된(또는 빈) 칸에 쓴다 */
export async function autoSave(state: GameState, label: string): Promise<SlotId> {
  const metas = await listSaves();
  let target: SlotId = AUTO_SLOTS[0];
  let oldest = Infinity;
  for (const s of AUTO_SLOTS) {
    const m = metas.find((x) => x.slot === s);
    const t = m?.meta?.savedAt ?? -1;
    if (t < oldest) {
      oldest = t;
      target = s;
    }
  }
  await saveGame(state, target, label);
  return target;
}

export async function loadGame(slot: SlotId): Promise<LoadResult> {
  const text = await backend().read(slot);
  if (text === null) return { ok: false, error: '빈 슬롯입니다.' };
  return parseSave(text);
}

export async function listSaves(): Promise<{ slot: SlotId; meta: SaveMeta | null; error?: string }[]> {
  await importLegacy();
  const out: { slot: SlotId; meta: SaveMeta | null; error?: string }[] = [];
  for (const slot of [...AUTO_SLOTS, ...MANUAL_SLOTS]) {
    const text = await backend().read(slot);
    if (text === null) {
      out.push({ slot, meta: null });
      continue;
    }
    const r = parseSave(text);
    out.push(r.ok ? { slot, meta: r.payload.meta } : { slot, meta: null, error: r.error });
  }
  return out;
}

export async function deleteSave(slot: SlotId): Promise<void> {
  await backend().remove(slot);
}

/** 예전(localStorage, 버전 없음) 세이브를 한 번만 새 슬롯으로 옮겨 온다. 원본은 지우지 않는다 */
let legacyChecked = false;
async function importLegacy(): Promise<void> {
  if (legacyChecked || override || typeof localStorage === 'undefined') return;
  legacyChecked = true;
  try {
    if (localStorage.getItem('samgukji.legacyImported')) return;
    const map: [string, SlotId][] = [
      ['samgukji.save.0', 'auto1'],
      ['samgukji.save.1', 'slot1'],
      ['samgukji.save.2', 'slot2'],
      ['samgukji.save.3', 'slot3'],
    ];
    for (const [key, slot] of map) {
      const text = localStorage.getItem(key);
      if (!text || (await backend().read(slot)) !== null) continue;
      const r = parseSave(text);
      if (r.ok) await backend().write(slot, JSON.stringify({ ...r.payload, meta: { ...r.payload.meta, slot } }));
    }
    localStorage.setItem('samgukji.legacyImported', '1');
  } catch {
    /* 옮기기 실패는 무시 (원본 그대로 남음) */
  }
}

/** 가장 최근의 정상 자동 저장 칸 (오류 화면 "자동 저장에서 이어하기"용). 없으면 null */
export async function latestAutoSlot(): Promise<SlotId | null> {
  const rows = await listSaves();
  let best: { slot: SlotId; t: number } | null = null;
  for (const r of rows) {
    if (!r.meta || !(AUTO_SLOTS as readonly string[]).includes(r.slot)) continue;
    if (!best || r.meta.savedAt > best.t) best = { slot: r.slot, t: r.meta.savedAt };
  }
  return best?.slot ?? null;
}

/**
 * 앱을 내릴 때의 저장 (QA-DEV-03): 달 중간·전투 중 상태도 남긴다.
 * 같은 달의 자동 저장이 이미 있으면 그 칸을 덮어써서, 백그라운드 전환을 여러 번 해도
 * 이전 달 자동 저장(복구용)이 밀려나지 않게 한다. 다른 달이면 평소처럼 가장 오래된 칸에 쓴다.
 */
export async function suspendSave(state: GameState, label: string, battle?: SavedBattle): Promise<SlotId> {
  const date = `${state.year}년 ${state.month}월`;
  const rows = await listSaves();
  let newest: { slot: SlotId; meta: SaveMeta } | null = null;
  for (const r of rows)
    if (r.meta && (AUTO_SLOTS as readonly string[]).includes(r.slot) && (!newest || r.meta.savedAt > newest.meta.savedAt)) newest = { slot: r.slot, meta: r.meta };
  if (newest && newest.meta.date === date) {
    await saveGame(state, newest.slot, label, battle);
    return newest.slot;
  }
  if (!battle) return autoSave(state, label);
  const slot = await autoSave(state, label);
  await saveGame(state, slot, label, battle);
  return slot;
}
