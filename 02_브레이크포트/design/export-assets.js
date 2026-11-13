/*
 * Export the art in art.js to PNG files for the game.
 * Usage: node export-assets.js   (needs @resvg/resvg-js on NODE_PATH or installed locally)
 * Output: design/assets/**  +  design/assets/manifest.json
 */
const fs = require('fs');
const path = require('path');
const { Resvg } = require('@resvg/resvg-js');
const M = require('./art.js');

const OUT = path.join(__dirname, 'assets');
const manifest = { note: '모든 PNG는 표시 크기의 2배(TEX_SCALE 2)입니다. 스프라이트 시트는 가로로 프레임이 이어져 있습니다.', units: {}, towers: {}, cards: {}, ui: {}, fx: {}, bg: {}, icons: {} };

function save(rel, svgStr) {
  const file = path.join(OUT, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const png = new Resvg(svgStr, { fitTo: { mode: 'original' }, background: 'rgba(0,0,0,0)' }).render().asPng();
  fs.writeFileSync(file, png);
  return rel.replace(/\\/g, '/');
}
const frame = (art, x, w, h) => `<svg x="${x}" y="0" width="${w}" height="${h}" viewBox="${art.vb}"><defs>${art.defs}</defs>${art.body}</svg>`;
const sheet = (arts, w, h) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w * arts.length}" height="${h}" viewBox="0 0 ${w * arts.length} ${h}">${arts.map((a, i) => frame(a, i * w, w, h)).join('')}</svg>`;

// ---- units: walk(2) + attack(2) sprite sheets, blue & red ----
for (const id of ['spearman', 'crossbow', 'shieldGiant', 'bats', 'bombGoblin', 'knights']) {
  const card = M.ROSTER_BY_ID[id];
  const s = M.SPRITE_SIZES[id] * 2;
  manifest.units[id] = { frameSize: s, frames: ['walk1', 'walk2', 'attack1', 'attack2'], displaySize: M.SPRITE_SIZES[id], files: {} };
  for (const team of [0, 1]) {
    const poses = [...M.POSES.walk, ...M.POSES.attack];
    const arts = poses.map((p) => M.charArt(card.art, team, p));
    manifest.units[id].files[M.TEAM[team].name] = save(`units/${id}_${M.TEAM[team].name}.png`, sheet(arts, s, s));
  }
}
// building (catapult): single image per team
{
  const s = M.SPRITE_SIZES.catapult * 2;
  manifest.units.catapult = { frameSize: s, frames: ['idle'], displaySize: M.SPRITE_SIZES.catapult, files: {} };
  for (const team of [0, 1]) manifest.units.catapult.files[M.TEAM[team].name] = save(`units/catapult_${M.TEAM[team].name}.png`, sheet([M.bldArt(M.ROSTER_BY_ID.catapult.art, team)], s, s));
}
// ---- towers ----
for (const type of ['main', 'side']) {
  const s = M.SPRITE_SIZES['tower_' + type] * 2;
  manifest.towers[type] = { size: s, displaySize: s / 2, files: {} };
  for (const team of [0, 1]) manifest.towers[type].files[M.TEAM[team].name] = save(`towers/tower_${type}_${M.TEAM[team].name}.png`, sheet([M.towerArt(type, team)], s, s));
}
// ---- cards: composite for all 50 (frame + art, no text), empty frames ----
for (const c of M.ROSTER) {
  const art = M.cardFrameArt(c.r, M.artFor(c, 0), c.art.c);
  manifest.cards[c.id] = save(`cards/card_${c.id}.png`, M.svg(art, 272, 350));
}
for (const r of ['c', 'r', 'e', 'l']) manifest.ui['frame_' + r] = save(`ui/card_frame_${r}.png`, M.svg(M.cardFrameArt(r), 272, 350));
manifest.ui.cardNote = '카드 PNG 272x350 = 슬롯 136x175의 2배. 코스트 숫자는 왼쪽 위 잉크 방울(중심 약 19,31 / 원본 좌표) 위에, 이름은 아래 리본(y 128~150)에 게임에서 글자로 올려 주세요.';
// ---- spell icon ----
manifest.icons.fireball = save('units/spell_fireball.png', M.svg(M.spellArt(M.ROSTER_BY_ID.fireball.art), 160, 160));
// ---- UI ----
for (const k of ['gold', 'blue', 'parchment', 'red']) {
  manifest.ui['button_' + k] = save(`ui/button_${k}.png`, M.svg(M.buttonArt(k), 1080, 210));
  manifest.ui['button_' + k + '_pressed'] = save(`ui/button_${k}_pressed.png`, M.svg(M.buttonArt(k, true), 1080, 210));
}
manifest.ui.panel = save('ui/panel.png', M.svg(M.panelArt(), 1120, 704));
// ---- effects ----
manifest.fx.explosion = { frameSize: 160, frames: 6, file: save('fx/explosion.png', sheet([0, 1, 2, 3, 4, 5].map((i) => M.explosionFrame(i)), 160, 160)) };
manifest.fx.deployCircle = { frameSize: 160, frames: 4, file: save('fx/deploy_circle.png', sheet([0, 1, 2, 3].map((i) => M.magicCircleFrame(i)), 160, 160)) };
for (const p of ['star', 'potion', 'pudding', 'wisp', 'fireball']) manifest.fx['projectile_' + p] = save(`fx/projectile_${p}.png`, M.svg(M.projectileArt(p), 64, 64));
// ---- backgrounds ----
manifest.bg.arena = save('bg/arena.png', M.svg(M.arenaArt(), 1440, 2560));
manifest.bg.menu = save('bg/menu.png', M.svg(M.menuBgArt(), 1440, 3120));
// ---- app icons (match client/public/icons names) ----
manifest.icons.app512 = save('icons/icon-512.png', M.svg(M.iconArt(false), 512, 512));
manifest.icons.app192 = save('icons/icon-192.png', M.svg(M.iconArt(false), 192, 192));
manifest.icons.maskable = save('icons/icon-maskable-512.png', M.svg(M.iconArt(true), 512, 512));
manifest.icons.apple = save('icons/apple-touch-icon.png', M.svg(M.iconArt(false), 180, 180));

fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2));
let count = 0;
(function walk(d) { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); fs.statSync(p).isDirectory() ? walk(p) : f.endsWith('.png') && count++; } })(OUT);
console.log('exported', count, 'PNG files to', OUT);
