import { create } from 'zustand';
import { setMuted } from './sound';

/** S17 설정. 기기마다 따로 저장 (localStorage) */
export interface Settings {
  fontSize: 'small' | 'normal' | 'large';
  colorBlind: boolean;
  showAD: boolean; // 연호에 서기 함께 표시
  showHanja: boolean; // 도시·무장 한자 병기
  battleSpeed: 1 | 2 | 3;
  muted: boolean;
  set<K extends keyof Omit<Settings, 'set'>>(k: K, v: Settings[K]): void;
}

const KEY = 'samgukji.settings';
const DEFAULTS = { fontSize: 'normal', colorBlind: false, showAD: true, showHanja: true, battleSpeed: 1, muted: false } as const;

function load(): Omit<Settings, 'set'> {
  try {
    return { ...DEFAULTS, ...(JSON.parse(localStorage.getItem(KEY) ?? '{}') as object) };
  } catch {
    return { ...DEFAULTS };
  }
}

export const useSettings = create<Settings>((set, get) => ({
  ...load(),
  set: (k, v) => {
    set({ [k]: v } as Partial<Settings>);
    const { set: _s, ...rest } = get();
    try {
      localStorage.setItem(KEY, JSON.stringify(rest));
    } catch {
      /* 저장 실패는 무시 */
    }
    applySettings();
  },
}));

/** 문서 루트에 반영: 글자 크기(+2pt 단계), 효과음 */
export function applySettings(): void {
  const s = useSettings.getState();
  const px = s.fontSize === 'small' ? 12 : s.fontSize === 'large' ? 15 : 13;
  document.documentElement.style.fontSize = `${px}px`;
  document.documentElement.dataset.colorblind = s.colorBlind ? '1' : '0';
  setMuted(s.muted);
}
