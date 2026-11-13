import { DEFAULT_DECK, isValidDeck } from "@bf/shared";
import type { BotDifficulty } from "@bf/shared";

/**
 * Player profile kept on this device (localStorage). Until accounts + server storage exist
 * (see docs/PREMORTEM.md), trophies are a local progression signal, not anti-cheat-safe.
 */
export interface Profile {
  deck: string[];
  trophies: number;
  best: number;
  wins: number;
  losses: number;
  draws: number;
  streak: number; // positive = win streak, negative = losing streak
  tutorialDone: boolean;
  difficulty: BotDifficulty;
}

const KEY = "bf_profile_v1";
export const WIN_TROPHIES = 30;
export const LOSS_TROPHIES = 20;

const fresh = (): Profile => ({
  deck: [...DEFAULT_DECK], trophies: 0, best: 0, wins: 0, losses: 0, draws: 0, streak: 0, tutorialDone: false, difficulty: "normal",
});

let cache: Profile | null = null;

export function getProfile(): Profile {
  if (cache) return cache;
  let p = fresh();
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) p = { ...p, ...JSON.parse(raw) };
  } catch { /* storage blocked: play with a session-only profile */ }
  if (!isValidDeck(p.deck)) p.deck = [...DEFAULT_DECK]; // cards may have changed between versions
  cache = p;
  return p;
}

export function saveProfile(patch: Partial<Profile>) {
  cache = { ...getProfile(), ...patch };
  try { localStorage.setItem(KEY, JSON.stringify(cache)); } catch { /* ignore */ }
}

/** Apply an online match result. AI-fallback matches count half. Returns the trophy change. */
export function recordResult(result: "win" | "loss" | "draw", vsAI: boolean): number {
  const p = getProfile();
  const k = vsAI ? 0.5 : 1;
  let delta = 0;
  if (result === "win") delta = Math.round(WIN_TROPHIES * k);
  else if (result === "loss") delta = -Math.min(p.trophies, Math.round(LOSS_TROPHIES * k));
  const trophies = p.trophies + delta;
  saveProfile({
    trophies,
    best: Math.max(p.best, trophies),
    wins: p.wins + (result === "win" ? 1 : 0),
    losses: p.losses + (result === "loss" ? 1 : 0),
    draws: p.draws + (result === "draw" ? 1 : 0),
    streak: result === "win" ? Math.max(1, p.streak + 1) : result === "loss" ? Math.min(-1, p.streak - 1) : 0,
  });
  return delta;
}

const RANKS = [
  { min: 0, name: "견습 병사", color: "#b0b7c3" },
  { min: 200, name: "브론즈", color: "#d08b5b" },
  { min: 500, name: "실버", color: "#cbd5e1" },
  { min: 900, name: "골드", color: "#ffd166" },
  { min: 1400, name: "플래티넘", color: "#7dd3fc" },
  { min: 2000, name: "전설의 요새", color: "#f0abfc" },
];

export function rankOf(trophies: number) {
  let i = 0;
  while (i + 1 < RANKS.length && trophies >= RANKS[i + 1].min) i++;
  const next = RANKS[i + 1];
  return { ...RANKS[i], next: next ? { name: next.name, need: next.min - trophies } : null };
}
