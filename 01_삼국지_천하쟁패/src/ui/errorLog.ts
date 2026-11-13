import { APP_VERSION } from '../version';

/** 오류 기록 (QA-DEV-02): 기기 안(localStorage)에 최근 20건을 버전·시각과 함께 남긴다. 버그 보고 때 설정 화면에서 꺼내 볼 수 있다 */
export interface ErrorEntry {
  v: string;
  at: string;
  where: string;
  msg: string;
  stack?: string;
}
const KEY = 'samgukji.errorlog';
const MAX = 20;

export function readErrorLog(): ErrorEntry[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '[]') as ErrorEntry[];
  } catch {
    return [];
  }
}

export function logError(where: string, err: unknown): ErrorEntry {
  const e = err instanceof Error ? err : new Error(String(err));
  const entry: ErrorEntry = { v: APP_VERSION, at: new Date().toISOString(), where, msg: e.message, stack: e.stack?.slice(0, 2000) };
  try {
    const list = [...readErrorLog(), entry].slice(-MAX);
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* 저장소가 막혀 있어도 오류 화면은 떠야 한다 */
  }
  console.error(`[${where}]`, err);
  return entry;
}
