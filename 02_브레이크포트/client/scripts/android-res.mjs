/**
 * Android launcher icons + splash screens from the designer's icon art (design/art.js iconArt),
 * replacing Capacitor's default placeholders. Also locks the app to portrait.
 * Usage (repo root, after `npx cap add android`):  node client/scripts/android-res.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const RES = path.join(root, "client/android/app/src/main/res");
const MANIFEST = path.join(root, "client/android/app/src/main/AndroidManifest.xml");
const { Resvg } = require("@resvg/resvg-js");
const M = require(path.join(root, "design/art.js"));
const BG = "#141129"; // art book "night" background

const png = (svg, file) => fs.writeFileSync(file, new Resvg(svg, { fitTo: { mode: "original" }, background: "rgba(0,0,0,0)" }).render().asPng());
const art = (a, x, y, size) => `<svg x="${x}" y="${y}" width="${size}" height="${size}" viewBox="${a.vb}"><defs>${a.defs}</defs>${a.body}</svg>`;
const wrap = (w, h, inner, bg) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${bg ? `<rect width="100%" height="100%" fill="${bg}"/>` : ""}${inner}</svg>`;

const icon = M.iconArt(false);
const maskable = M.iconArt(true);
const DENSITY = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };

for (const [d, k] of Object.entries(DENSITY)) {
  const dir = path.join(RES, `mipmap-${d}`);
  const s = Math.round(48 * k);
  png(wrap(s, s, art(icon, 0, 0, s)), path.join(dir, "ic_launcher.png"));
  // round legacy icon: circle-clipped
  png(wrap(s, s, `<clipPath id="c"><circle cx="${s / 2}" cy="${s / 2}" r="${s / 2}"/></clipPath><g clip-path="url(#c)">${art(maskable, 0, 0, s)}</g>`), path.join(dir, "ic_launcher_round.png"));
  // adaptive foreground (108dp canvas, art fills it; the launcher applies its own mask)
  const f = Math.round(108 * k);
  png(wrap(f, f, art(maskable, 0, 0, f)), path.join(dir, "ic_launcher_foreground.png"));
}
fs.writeFileSync(path.join(RES, "values/ic_launcher_background.xml"),
  `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">${BG}</color>\n</resources>\n`);

// splash: night background with the app icon in the middle, at every existing splash size
let splashes = 0;
for (const dir of fs.readdirSync(RES).filter((n) => n.startsWith("drawable"))) {
  const file = path.join(RES, dir, "splash.png");
  if (!fs.existsSync(file)) continue;
  const head = fs.readFileSync(file).subarray(16, 24);
  const w = head.readUInt32BE(0), h = head.readUInt32BE(4);
  const s = Math.round(Math.min(w, h) * 0.42);
  png(wrap(w, h, art(icon, (w - s) / 2, (h - s) / 2, s), BG), file);
  splashes++;
}

// portrait only (the game layout is portrait)
let manifest = fs.readFileSync(MANIFEST, "utf8");
if (!manifest.includes("android:screenOrientation")) {
  manifest = manifest.replace(/<activity(\s)/, '<activity android:screenOrientation="portrait"$1');
  fs.writeFileSync(MANIFEST, manifest);
}
console.log(`android icons for ${Object.keys(DENSITY).length} densities, ${splashes} splash screens, portrait lock`);
