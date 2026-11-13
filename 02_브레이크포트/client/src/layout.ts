import { ARENA_H, ARENA_W } from "@bf/shared";

export const TILE = 40;
export const GAME_W = ARENA_W * TILE; // 720
export const ARENA_PX_H = ARENA_H * TILE; // 1280
export const UI_H = 280;
export const GAME_H = ARENA_PX_H + UI_H; // 1560

/** Design tokens from the art book ("몬스터 클래스"). */
export const COLORS = {
  me: 0x4f8bff, meDark: 0x2f5fc8,
  enemy: 0xff6b4a, enemyDark: 0xc8442c,
  ink: 0x2a2350, // outlines, shadows
  ui: 0x1d1838, // night velvet: panels, card backing
  uiDark: 0x141129,
  parchment: 0xf4e9d2,
  gold: 0xf2c14e,
  mana: 0x7b4be0,
  // legacy procedural-arena colours (fallback art only)
  grass: 0x5c9e45, grassDark: 0x548f3f, river: 0x3a8fd6, bridge: 0x9b6b3d,
};
export const CSS = { ink: "#2a2350", parchment: "#f4e9d2", gold: "#f2c14e", text: "#f1ecff", dim: "#b5acd9", ribbon: "#3a2a14", coral: "#ff6b4a", moon: "#4f8bff" };

const FALLBACK = "'Malgun Gothic', 'Apple SD Gothic Neo', sans-serif";
/** Titles & card names / numbers & buttons / speech / body text. */
export const FONT_TITLE = `'Gowun Batang', ${FALLBACK}`;
export const FONT_NUM = `'Jua', ${FALLBACK}`;
export const FONT_HAND = `'Gaegu', ${FALLBACK}`;
export const FONT = `'Gowun Dodum', ${FALLBACK}`;
