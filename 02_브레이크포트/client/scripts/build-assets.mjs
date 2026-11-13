/**
 * Builds the game's asset folder from the designer's hand-off:
 *   1. copies design/assets/** -> client/public/assets/** (and the app icons -> client/public/icons)
 *   2. renders battle sprites for cards that have card art but no sprite sheet yet, using the
 *      designer's own drawing code (design/art.js), at the size the game displays them (x2)
 *   3. writes client/public/assets/game-manifest.json, which the game loads at boot
 *
 * Usage (repo root):  node client/scripts/build-assets.mjs
 * Never edits files under design/.
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const SRC = path.join(root, "design/assets");
const OUT = path.join(root, "client/public/assets");
const ICONS = path.join(root, "client/public/icons");
const { Resvg } = require("@resvg/resvg-js");
const M = require(path.join(root, "design/art.js"));
const cards = JSON.parse(fs.readFileSync(path.join(root, "shared/data/cards.json"), "utf8")).cards;
const designer = JSON.parse(fs.readFileSync(path.join(SRC, "manifest.json"), "utf8"));

const TILE = 40, TEX_SCALE = 2;
// must match client/src/art.ts displaySize()
const displaySize = (c) => Math.round((c.radius ?? 0.5) * 2 * TILE * (c.type === "building" ? 1.5 : 1.75));

// 1. copy only what the game uses (keeps the phone download small)
// empty the folder (not the folder itself: on Windows a dev server/terminal may hold it open)
fs.mkdirSync(OUT, { recursive: true });
for (const entry of fs.readdirSync(OUT)) fs.rmSync(path.join(OUT, entry), { recursive: true, force: true });
const copy = (rel) => {
  fs.mkdirSync(path.dirname(path.join(OUT, rel)), { recursive: true });
  fs.copyFileSync(path.join(SRC, rel), path.join(OUT, rel));
};
const inGame = new Set(cards.map((c) => c.id));
for (const [id, u] of Object.entries(designer.units)) if (inGame.has(id)) Object.values(u.files).forEach(copy);
for (const t of Object.values(designer.towers)) Object.values(t.files).forEach(copy);
for (const [id, file] of Object.entries(designer.cards)) if (inGame.has(id)) copy(file);
const UI_USED = (k) => k.startsWith("button_") || k === "panel"; // empty card frames are for future cards
for (const [k, file] of Object.entries(designer.ui)) if (UI_USED(k)) copy(file);
copy(designer.fx.explosion.file);
copy(designer.fx.deployCircle.file);
for (const [k, file] of Object.entries(designer.fx)) if (k.startsWith("projectile_")) copy(file);
Object.values(designer.bg).forEach(copy);
for (const f of fs.readdirSync(path.join(SRC, "icons"))) fs.copyFileSync(path.join(SRC, "icons", f), path.join(ICONS, f));

// 2. render missing sprites
const save = (rel, svg) => {
  const file = path.join(OUT, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, new Resvg(svg, { fitTo: { mode: "original" }, background: "rgba(0,0,0,0)" }).render().asPng());
  return rel;
};
const frame = (art, x, w, h) => `<svg x="${x}" y="0" width="${w}" height="${h}" viewBox="${art.vb}"><defs>${art.defs}</defs>${art.body}</svg>`;
const sheet = (arts, w, h) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w * arts.length}" height="${h}" viewBox="0 0 ${w * arts.length} ${h}">${arts.map((a, i) => frame(a, i * w, w, h)).join("")}</svg>`;
const TEAMS = ["blue", "red"];

const units = {};
const rendered = [];
for (const c of cards) {
  if (c.type === "spell") continue;
  const given = designer.units[c.id];
  if (given) { units[c.id] = { frameSize: given.frameSize, frames: given.frames.length, files: given.files }; continue; }
  const spec = M.ROSTER_BY_ID[c.id];
  if (!spec) { console.warn(`! no designer art for ${c.id} (game falls back to placeholder art)`); continue; }
  const s = displaySize(c) * TEX_SCALE;
  const files = {};
  for (const [team, name] of TEAMS.entries()) {
    const arts = c.type === "building" ? [M.bldArt(spec.art, team)] : [...M.POSES.walk, ...M.POSES.attack].map((p) => M.charArt(spec.art, team, p));
    files[name] = save(`units/${c.id}_${name}.png`, sheet(arts, s, s));
  }
  units[c.id] = { frameSize: s, frames: c.type === "building" ? 1 : 4, files };
  rendered.push(`${c.id} (${s}px)`);
}

const missingCards = cards.filter((c) => !designer.cards[c.id]).map((c) => c.id);

// 3. game manifest
const manifest = {
  units,
  towers: designer.towers,
  cards: Object.fromEntries(cards.filter((c) => designer.cards[c.id]).map((c) => [c.id, designer.cards[c.id]])),
  ui: Object.fromEntries(Object.entries(designer.ui).filter(([k]) => UI_USED(k))),
  fx: designer.fx,
  bg: designer.bg,
};
fs.writeFileSync(path.join(OUT, "game-manifest.json"), JSON.stringify(manifest, null, 2));

console.log(`copied design/assets -> client/public/assets, icons -> client/public/icons`);
console.log(`rendered ${rendered.length} sprite sheets from design/art.js: ${rendered.join(", ")}`);
if (missingCards.length) console.warn(`! cards without card art: ${missingCards.join(", ")}`);
console.log(`game-manifest.json: ${Object.keys(units).length} unit/building sprites, ${Object.keys(manifest.cards).length} cards`);
