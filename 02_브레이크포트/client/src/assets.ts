import * as Phaser from "phaser";
import type { Team } from "./art";
import { towerKey, unitKey } from "./art";

/**
 * Loads the designer's PNGs (client/public/assets, built by client/scripts/build-assets.mjs).
 * Texture keys match the procedural fallback art in art.ts, so anything missing still renders.
 */

interface GameManifest {
  units: Record<string, { frameSize: number; frames: number; files: { blue: string; red: string } }>;
  towers: Record<"main" | "side", { size: number; files: { blue: string; red: string } }>;
  cards: Record<string, string>;
  ui: Record<string, string>;
  fx: { explosion: { frameSize: number; frames: number; file: string }; deployCircle: { frameSize: number; frames: number; file: string } } & Record<string, unknown>;
  bg: { arena: string; menu: string };
}

const BASE = "assets/";
const TEAM_FILE = ["blue", "red"] as const;
export const cardKey = (id: string) => `card_${id}`;
export const uiKey = (name: string) => `ui_${name}`;
export const PROJECTILES = ["star", "potion", "pudding", "wisp", "fireball"] as const;
export type ProjectileKind = (typeof PROJECTILES)[number];
export const projectileKey = (k: ProjectileKind) => `proj_${k}`;
export const walkAnim = (key: string) => `${key}_walk`;
export const attackAnim = (key: string) => `${key}_attack`;

/** Which projectile sprite a shooter uses. */
export function projectileFor(src: string): ProjectileKind {
  if (src.startsWith("tower_")) return "wisp";
  if (src === "catapult") return "pudding";
  if (src === "bombGoblin") return "potion";
  if (src === "salamander" || src === "sleepyDragon" || src === "candleWatch") return "fireball";
  return "star";
}

/** Phase 1 (preload): the manifest. Phase 2 (on manifest load): every file it lists. */
export function preloadAssets(scene: Phaser.Scene) {
  scene.load.json("game-manifest", `${BASE}game-manifest.json`);
  scene.load.once("filecomplete-json-game-manifest", (_k: string, _t: string, m: GameManifest) => {
    const L = scene.load;
    for (const [id, u] of Object.entries(m.units)) {
      for (const team of [0, 1] as Team[]) {
        const file = BASE + u.files[TEAM_FILE[team]];
        if (u.frames > 1) L.spritesheet(unitKey(id, team), file, { frameWidth: u.frameSize, frameHeight: u.frameSize });
        else L.image(unitKey(id, team), file);
      }
    }
    for (const type of ["main", "side"] as const) {
      for (const team of [0, 1] as Team[]) L.image(towerKey(type, team), BASE + m.towers[type].files[TEAM_FILE[team]]);
    }
    for (const [id, file] of Object.entries(m.cards)) L.image(cardKey(id), BASE + file);
    for (const [name, file] of Object.entries(m.ui)) L.image(uiKey(name), BASE + file);
    L.spritesheet("fx_explosion", BASE + m.fx.explosion.file, { frameWidth: m.fx.explosion.frameSize, frameHeight: m.fx.explosion.frameSize });
    L.spritesheet("fx_deploy", BASE + m.fx.deployCircle.file, { frameWidth: m.fx.deployCircle.frameSize, frameHeight: m.fx.deployCircle.frameSize });
    for (const k of PROJECTILES) L.image(projectileKey(k), `${BASE}fx/projectile_${k}.png`);
    L.image("bg_arena", BASE + m.bg.arena);
    L.image("bg_menu", BASE + m.bg.menu);
  });
}

/** Walk (frames 0-1) / attack (2-3) loops for every 4-frame unit sheet, plus fx animations. */
export function createAnims(scene: Phaser.Scene) {
  const A = scene.anims;
  for (const key of scene.textures.getTextureKeys()) {
    if (!key.startsWith("u_")) continue;
    if (scene.textures.get(key).frameTotal < 5) continue; // 4 frames + the __BASE frame
    if (!A.exists(walkAnim(key))) A.create({ key: walkAnim(key), frames: A.generateFrameNumbers(key, { frames: [0, 1] }), frameRate: 5, repeat: -1 });
    if (!A.exists(attackAnim(key))) A.create({ key: attackAnim(key), frames: A.generateFrameNumbers(key, { frames: [2, 3] }), frameRate: 6, repeat: -1 });
  }
  if (scene.textures.exists("fx_explosion") && !A.exists("fx_explosion")) A.create({ key: "fx_explosion", frames: A.generateFrameNumbers("fx_explosion", {}), frameRate: 18 });
  if (scene.textures.exists("fx_deploy") && !A.exists("fx_deploy")) A.create({ key: "fx_deploy", frames: A.generateFrameNumbers("fx_deploy", {}), frameRate: 6, repeat: -1 });
}

export const hasAnim = (scene: Phaser.Scene, key: string) => scene.anims.exists(walkAnim(key));

/** Wait (max ~3s) for the art book's web fonts so Phaser text renders with them. */
export async function loadFonts() {
  const fonts = ["700 32px 'Gowun Batang'", "32px 'Jua'", "700 32px 'Gaegu'", "32px 'Gowun Dodum'"];
  try {
    await Promise.race([
      Promise.all(fonts.map((f) => document.fonts.load(f, "가나다 ABC 123"))),
      new Promise((r) => setTimeout(r, 3000)),
    ]);
  } catch { /* offline: fall back to system fonts */ }
}
