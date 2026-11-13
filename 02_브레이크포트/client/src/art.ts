import * as Phaser from "phaser";
import { CARDS, getCard } from "@bf/shared";
import { TILE } from "./layout";

/**
 * Original procedural art: every unit, tower and building is drawn with vector shapes at boot
 * and baked into textures (2x resolution, displayed at half scale). No external image assets.
 */

export const TEX_SCALE = 2;
export type Team = 0 | 1; // 0 = me (blue), 1 = enemy (red)

const TEAM = [
  { main: 0x3b82f6, dark: 0x1d4ed8, light: 0x93c5fd },
  { main: 0xef4444, dark: 0xb91c1c, light: 0xfca5a5 },
] as const;
const SKIN = 0xf2c9a0;
const METAL = 0xc3ccd6;
const METAL_DARK = 0x7b8794;
const WOOD = 0x8b5a2b;
const WOOD_DARK = 0x5e3a1a;
const INK = 0x1f2937;
const STONE = 0xa7adb5;
const STONE_DARK = 0x6b7280;

export const unitKey = (cardId: string, team: Team) => `u_${cardId}_${team}`;
export const towerKey = (type: "main" | "side", team: Team) => `t_${type}_${team}`;
export const iconKey = (cardId: string) => (getCard(cardId).type === "spell" ? `i_${cardId}` : unitKey(cardId, 0));

/** On-screen size (px) of a unit/building sprite. */
export function displaySize(cardId: string): number {
  const c = getCard(cardId);
  if (c.type === "building") return (c.radius ?? 0.9) * 2 * TILE * 1.5;
  return (c.radius ?? 0.5) * 2 * TILE * 1.75;
}
export const towerDisplaySize = (type: "main" | "side") => (type === "main" ? 3.4 : 2.6) * TILE;

type Draw = (g: Phaser.GameObjects.Graphics, u: number, t: (typeof TEAM)[number]) => void;

// helpers — all coordinates are relative to the texture centre, `u` = half the texture size
function eyes(g: Phaser.GameObjects.Graphics, x: number, y: number, s: number) {
  g.fillStyle(INK).fillCircle(x - s, y, s * 0.45).fillCircle(x + s, y, s * 0.45);
}
function body(g: Phaser.GameObjects.Graphics, u: number, color: number, r = 0.5, y = 0.2) {
  g.fillStyle(color).fillCircle(0, y * u, r * u);
  g.lineStyle(u * 0.06, INK, 0.9).strokeCircle(0, y * u, r * u);
}
function head(g: Phaser.GameObjects.Graphics, u: number, color = SKIN, y = -0.32, r = 0.28) {
  g.fillStyle(color).fillCircle(0, y * u, r * u);
  g.lineStyle(u * 0.05, INK, 0.9).strokeCircle(0, y * u, r * u);
  eyes(g, 0, (y + 0.03) * u, r * u * 0.38);
}

const DRAW: Record<string, Draw> = {
  spearman(g, u, t) {
    g.lineStyle(u * 0.1, WOOD_DARK).lineBetween(-0.55 * u, 0.75 * u, 0.6 * u, -0.7 * u);
    g.fillStyle(METAL).fillTriangle(0.52 * u, -0.6 * u, 0.82 * u, -0.92 * u, 0.7 * u, -0.5 * u);
    body(g, u, t.main);
    g.fillStyle(t.dark).fillRect(-0.45 * u, 0.12 * u, 0.9 * u, 0.14 * u);
    head(g, u);
    g.fillStyle(METAL).slice(0, -0.34 * u, 0.3 * u, Math.PI, 0, false).fillPath();
    g.fillStyle(METAL_DARK).fillRect(-0.3 * u, -0.38 * u, 0.6 * u, 0.06 * u);
  },
  crossbow(g, u, t) {
    body(g, u, t.dark, 0.46);
    g.fillStyle(0x3f6212).fillCircle(0, -0.32 * u, 0.33 * u); // hood
    g.fillStyle(SKIN).fillCircle(0, -0.27 * u, 0.22 * u);
    eyes(g, 0, -0.26 * u, 0.08 * u);
    g.lineStyle(u * 0.1, WOOD).lineBetween(-0.15 * u, 0.25 * u, 0.7 * u, 0.25 * u);
    g.lineStyle(u * 0.07, METAL).beginPath().arc(0.55 * u, 0.25 * u, 0.3 * u, -Math.PI / 2, Math.PI / 2).strokePath();
    g.fillStyle(t.light).fillCircle(-0.25 * u, 0.3 * u, 0.1 * u);
  },
  shieldGiant(g, u, t) {
    body(g, u, t.dark, 0.6, 0.15);
    head(g, u, SKIN, -0.42, 0.26);
    g.fillStyle(METAL_DARK).fillRect(-0.3 * u, -0.66 * u, 0.6 * u, 0.12 * u);
    // big round shield in front
    g.fillStyle(WOOD).fillCircle(-0.12 * u, 0.3 * u, 0.48 * u);
    g.lineStyle(u * 0.09, METAL).strokeCircle(-0.12 * u, 0.3 * u, 0.48 * u);
    g.fillStyle(t.main).fillCircle(-0.12 * u, 0.3 * u, 0.2 * u);
    g.fillStyle(METAL).fillCircle(-0.12 * u, 0.3 * u, 0.08 * u);
  },
  bats(g, u, t) {
    g.fillStyle(0x3b2a4a)
      .fillTriangle(-0.15 * u, -0.1 * u, -0.95 * u, -0.45 * u, -0.7 * u, 0.3 * u)
      .fillTriangle(0.15 * u, -0.1 * u, 0.95 * u, -0.45 * u, 0.7 * u, 0.3 * u);
    g.fillStyle(0x4c3a5e).fillCircle(0, 0, 0.36 * u);
    g.fillTriangle(-0.28 * u, -0.2 * u, -0.18 * u, -0.6 * u, -0.05 * u, -0.28 * u)
      .fillTriangle(0.28 * u, -0.2 * u, 0.18 * u, -0.6 * u, 0.05 * u, -0.28 * u);
    g.fillStyle(t.light).fillCircle(-0.13 * u, -0.05 * u, 0.09 * u).fillCircle(0.13 * u, -0.05 * u, 0.09 * u);
    g.fillStyle(t.main).fillRect(-0.3 * u, 0.18 * u, 0.6 * u, 0.1 * u);
  },
  bombGoblin(g, u, t) {
    body(g, u, t.main, 0.46);
    const green = 0x7cb342;
    g.fillStyle(green)
      .fillTriangle(-0.22 * u, -0.38 * u, -0.62 * u, -0.5 * u, -0.25 * u, -0.2 * u)
      .fillTriangle(0.22 * u, -0.38 * u, 0.62 * u, -0.5 * u, 0.25 * u, -0.2 * u);
    head(g, u, green);
    g.fillStyle(INK).fillCircle(0.45 * u, 0.3 * u, 0.28 * u); // bomb
    g.fillStyle(0x6b7280).fillCircle(0.38 * u, 0.22 * u, 0.08 * u);
    g.lineStyle(u * 0.05, WOOD).lineBetween(0.55 * u, 0.06 * u, 0.68 * u, -0.12 * u);
    g.fillStyle(0xffd23f).fillCircle(0.7 * u, -0.15 * u, 0.09 * u);
    g.fillStyle(0xff7a1a).fillCircle(0.7 * u, -0.15 * u, 0.045 * u);
  },
  knights(g, u, t) {
    g.lineStyle(u * 0.09, METAL).lineBetween(0.4 * u, 0.5 * u, 0.62 * u, -0.55 * u);
    g.lineStyle(u * 0.08, WOOD_DARK).lineBetween(0.28 * u, 0.32 * u, 0.58 * u, 0.36 * u);
    body(g, u, METAL);
    g.fillStyle(t.main).fillRect(-0.16 * u, -0.12 * u, 0.32 * u, 0.7 * u); // tabard
    g.fillStyle(METAL).fillCircle(0, -0.32 * u, 0.3 * u);
    g.lineStyle(u * 0.05, INK, 0.9).strokeCircle(0, -0.32 * u, 0.3 * u);
    g.fillStyle(INK).fillRect(-0.18 * u, -0.34 * u, 0.36 * u, 0.06 * u); // visor slit
    g.fillStyle(t.main).fillEllipse(0, -0.68 * u, 0.18 * u, 0.32 * u); // plume
  },
  fireMage(g, u, t) {
    g.lineStyle(u * 0.09, WOOD_DARK).lineBetween(0.5 * u, 0.7 * u, 0.55 * u, -0.45 * u); // staff
    g.fillStyle(0xff7a1a).fillCircle(0.55 * u, -0.55 * u, 0.16 * u);
    g.fillStyle(0xfff1a8).fillCircle(0.55 * u, -0.55 * u, 0.07 * u);
    g.fillStyle(t.dark).fillTriangle(-0.5 * u, 0.7 * u, 0.5 * u, 0.7 * u, 0, -0.2 * u); // robe
    g.lineStyle(u * 0.05, INK, 0.9).strokeTriangle(-0.5 * u, 0.7 * u, 0.5 * u, 0.7 * u, 0, -0.2 * u);
    head(g, u, SKIN, -0.28, 0.25);
    g.fillStyle(t.main).fillTriangle(-0.36 * u, -0.38 * u, 0.36 * u, -0.38 * u, 0.05 * u, -0.95 * u); // hat
    g.fillStyle(0xffd166).fillCircle(0.04 * u, -0.6 * u, 0.06 * u);
  },
  cavalry(g, u, t) {
    const horse = 0x8b5e3c;
    g.fillStyle(horse).fillEllipse(0, 0.3 * u, 1.3 * u, 0.6 * u); // body
    g.fillStyle(horse).fillEllipse(0.62 * u, 0.0, 0.42 * u, 0.3 * u); // head
    g.fillStyle(INK).fillRect(-0.5 * u, 0.5 * u, 0.12 * u, 0.32 * u).fillRect(0.4 * u, 0.5 * u, 0.12 * u, 0.32 * u);
    g.fillStyle(0x3f2a1a).fillTriangle(-0.62 * u, 0.2 * u, -0.9 * u, 0.5 * u, -0.6 * u, 0.4 * u); // tail
    g.fillStyle(t.main).fillRect(-0.3 * u, 0.12 * u, 0.6 * u, 0.3 * u); // saddle cloth
    g.fillStyle(METAL).fillCircle(-0.05 * u, -0.28 * u, 0.3 * u); // rider
    g.fillStyle(SKIN).fillCircle(-0.05 * u, -0.5 * u, 0.2 * u);
    eyes(g, -0.05 * u, -0.5 * u, 0.06 * u);
    g.lineStyle(u * 0.08, WOOD_DARK).lineBetween(-0.3 * u, -0.1 * u, 0.9 * u, -0.6 * u); // lance
    g.fillStyle(METAL).fillTriangle(0.85 * u, -0.55 * u, 1.0 * u, -0.68 * u, 0.82 * u, -0.7 * u);
  },
  cannon(g, u, t) {
    g.fillStyle(STONE_DARK).fillRoundedRect(-0.7 * u, -0.05 * u, 1.4 * u, 0.75 * u, 0.12 * u);
    g.fillStyle(STONE).fillRoundedRect(-0.62 * u, 0.0, 1.24 * u, 0.62 * u, 0.1 * u);
    g.fillStyle(t.main).fillRect(-0.62 * u, 0.0, 1.24 * u, 0.12 * u);
    g.fillStyle(INK).fillCircle(0, -0.05 * u, 0.36 * u);
    g.fillStyle(0x374151).fillRoundedRect(-0.16 * u, -0.85 * u, 0.32 * u, 0.8 * u, 0.06 * u); // barrel
    g.fillStyle(INK).fillCircle(0, -0.82 * u, 0.12 * u);
  },
  imps(g, u, t) {
    const red = 0xd9534f;
    g.fillStyle(red).fillTriangle(-0.28 * u, -0.3 * u, -0.45 * u, -0.8 * u, -0.08 * u, -0.45 * u)
      .fillTriangle(0.28 * u, -0.3 * u, 0.45 * u, -0.8 * u, 0.08 * u, -0.45 * u); // horns
    body(g, u, t.main, 0.42, 0.3);
    head(g, u, 0xe8a87c, -0.2, 0.32);
    g.fillStyle(0xffffff).fillTriangle(-0.1 * u, -0.05 * u, -0.02 * u, -0.05 * u, -0.06 * u, 0.04 * u)
      .fillTriangle(0.02 * u, -0.05 * u, 0.1 * u, -0.05 * u, 0.06 * u, 0.04 * u); // fangs
    g.lineStyle(u * 0.08, WOOD_DARK).lineBetween(0.4 * u, 0.6 * u, 0.6 * u, 0.0); // club
    g.fillStyle(WOOD).fillCircle(0.62 * u, -0.05 * u, 0.13 * u);
  },
  catapult(g, u, t) {
    g.fillStyle(WOOD_DARK).fillRoundedRect(-0.75 * u, -0.1 * u, 1.5 * u, 0.55 * u, 0.08 * u);
    g.fillStyle(WOOD).fillRoundedRect(-0.68 * u, -0.05 * u, 1.36 * u, 0.42 * u, 0.06 * u);
    g.fillStyle(INK).fillCircle(-0.5 * u, 0.5 * u, 0.2 * u).fillCircle(0.5 * u, 0.5 * u, 0.2 * u);
    g.fillStyle(METAL_DARK).fillCircle(-0.5 * u, 0.5 * u, 0.08 * u).fillCircle(0.5 * u, 0.5 * u, 0.08 * u);
    g.lineStyle(u * 0.12, WOOD_DARK).lineBetween(-0.2 * u, 0.05 * u, 0.4 * u, -0.7 * u);
    g.fillStyle(STONE).fillCircle(0.45 * u, -0.75 * u, 0.17 * u);
    g.fillStyle(t.main).fillTriangle(-0.62 * u, -0.1 * u, -0.62 * u, -0.6 * u, -0.25 * u, -0.45 * u);
    g.lineStyle(u * 0.04, INK).lineBetween(-0.62 * u, -0.05 * u, -0.62 * u, -0.62 * u);
  },
};

function drawTower(g: Phaser.GameObjects.Graphics, u: number, t: (typeof TEAM)[number], main: boolean) {
  const w = main ? 0.86 : 0.8;
  // base
  g.fillStyle(STONE_DARK).fillRoundedRect(-w * u, -0.55 * u, 2 * w * u, 1.45 * u, 0.12 * u);
  g.fillStyle(STONE).fillRoundedRect(-(w - 0.06) * u, -0.5 * u, 2 * (w - 0.06) * u, 1.34 * u, 0.1 * u);
  // bricks
  g.lineStyle(u * 0.02, STONE_DARK, 0.7);
  for (let row = 0; row < 5; row++) {
    const y = (-0.3 + row * 0.24) * u;
    g.lineBetween(-(w - 0.06) * u, y, (w - 0.06) * u, y);
    for (let c = -2; c <= 2; c++) {
      const x = (c * 0.3 + (row % 2 ? 0.15 : 0)) * u;
      if (Math.abs(x) < (w - 0.1) * u) g.lineBetween(x, y, x, y + 0.24 * u);
    }
  }
  // crenellations
  g.fillStyle(STONE_DARK);
  for (let i = 0; i < 4; i++) g.fillRect((-w + i * (2 * w / 3.5)) * u, -0.72 * u, 0.3 * u, 0.22 * u);
  // team roof band + door / window
  g.fillStyle(t.main).fillRect(-(w - 0.06) * u, -0.5 * u, 2 * (w - 0.06) * u, 0.16 * u);
  g.fillStyle(INK).slice(0, 0.85 * u, 0.26 * u, Math.PI, 0, false).fillPath();
  g.fillRect(-0.26 * u, 0.62 * u, 0.52 * u, 0.25 * u);
  // flag
  g.lineStyle(u * 0.05, INK).lineBetween(0, -0.72 * u, 0, -0.98 * u - (main ? 0.04 * u : 0));
  g.fillStyle(t.main).fillTriangle(0, -0.98 * u, 0, -0.78 * u, 0.32 * u, -0.88 * u);
  if (main) {
    g.fillStyle(0xffd166).fillCircle(0, 0.1 * u, 0.16 * u); // emblem
    g.fillStyle(t.dark).fillCircle(0, 0.1 * u, 0.08 * u);
  }
}

function drawFireball(g: Phaser.GameObjects.Graphics, u: number) {
  g.fillStyle(0xff7a1a);
  for (let i = 0; i < 7; i++) {
    const a = -Math.PI / 2 + (i - 3) * 0.32;
    g.fillTriangle(Math.cos(a - 0.3) * 0.4 * u, 0.15 * u + Math.sin(a - 0.3) * 0.4 * u,
      Math.cos(a + 0.3) * 0.4 * u, 0.15 * u + Math.sin(a + 0.3) * 0.4 * u,
      Math.cos(a) * 0.95 * u, 0.15 * u + Math.sin(a) * 0.95 * u);
  }
  g.fillStyle(0xff7a1a).fillCircle(0, 0.2 * u, 0.55 * u);
  g.fillStyle(0xffb347).fillCircle(0, 0.25 * u, 0.38 * u);
  g.fillStyle(0xfff1a8).fillCircle(0, 0.3 * u, 0.2 * u);
}

function drawArrowRain(g: Phaser.GameObjects.Graphics, u: number) {
  for (const [x, y] of [[-0.5, -0.2], [0, -0.55], [0.45, -0.15], [-0.15, 0.3], [0.35, 0.45]]) {
    g.lineStyle(u * 0.07, WOOD).lineBetween((x - 0.2) * u, (y - 0.4) * u, x * u, y * u);
    g.fillStyle(METAL).fillTriangle(x * u, (y + 0.12) * u, (x - 0.08) * u, (y - 0.04) * u, (x + 0.08) * u, (y - 0.04) * u);
    g.fillStyle(0xe5e7eb).fillTriangle((x - 0.2) * u, (y - 0.4) * u, (x - 0.32) * u, (y - 0.48) * u, (x - 0.16) * u, (y - 0.52) * u);
  }
}

function bake(scene: Phaser.Scene, key: string, sizePx: number, draw: (g: Phaser.GameObjects.Graphics, u: number) => void) {
  if (scene.textures.exists(key)) return;
  const s = Math.ceil(sizePx * TEX_SCALE);
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  g.translateCanvas(s / 2, s / 2);
  draw(g, (s / 2) * 0.96);
  g.generateTexture(key, s, s);
  g.destroy();
}

/** Create all textures once (call from the first scene). */
export function createTextures(scene: Phaser.Scene) {
  for (const team of [0, 1] as Team[]) {
    for (const c of CARDS) {
      const d = DRAW[c.id];
      if (d) bake(scene, unitKey(c.id, team), displaySize(c.id), (g, u) => d(g, u, TEAM[team]));
    }
    bake(scene, towerKey("main", team), towerDisplaySize("main"), (g, u) => drawTower(g, u, TEAM[team], true));
    bake(scene, towerKey("side", team), towerDisplaySize("side"), (g, u) => drawTower(g, u, TEAM[team], false));
  }
  bake(scene, "i_fireball", 2 * TILE, drawFireball);
  bake(scene, "i_arrowRain", 2 * TILE, drawArrowRain);
  bake(scene, "px", 4, (g) => g.fillStyle(0xffffff).fillRect(-4, -4, 8, 8)); // 1-colour helper
}
