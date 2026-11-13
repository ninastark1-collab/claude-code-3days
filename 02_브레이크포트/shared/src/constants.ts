export const TICK_RATE = 20;
export const DT = 1 / TICK_RATE;

export const ARENA_W = 18;
export const ARENA_H = 32;
export const RIVER_TOP = 15;
export const RIVER_BOTTOM = 17;
export const BRIDGES = [3.5, 14.5] as const;
export const BRIDGE_HALF = 1;

export const MATCH_TIME = 180;
export const OVERTIME = 60;
export const DOUBLE_MANA_AT = 120; // last minute of regulation
export const MANA_MAX = 10;
export const MANA_START = 5;
export const MANA_PER_SEC = 1 / 2.8;

export const DEPLOY_TIME = 1.0;
/** Quick match: seconds without an opponent before an AI opponent is assigned. */
export const AI_FALLBACK_SEC = 15;
export const UNIT_SIGHT = 5.5;
export const PROJECTILE_SPEED = 12;
export const MELEE_MAX_RANGE = 1.5;

/** Player 0 deploys at y >= this (own half). Player 1 is mirrored. */
export const DEPLOY_MIN_Y = RIVER_BOTTOM;
/** After destroying the enemy side tower of a lane, that lane's zone extends up to here. */
export const DEPLOY_EXPANDED_MIN_Y = 11;

/** Tower positions in player-0 space (bottom). Player 1 mirrors y. */
export const TOWER_LAYOUT = [
  { type: "main" as const, x: 9, y: 28.5, lane: -1 as const },
  { type: "side" as const, x: 3.5, y: 25.5, lane: 0 as const },
  { type: "side" as const, x: 14.5, y: 25.5, lane: 1 as const },
];
