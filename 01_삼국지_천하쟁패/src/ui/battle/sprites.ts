/**
 * 전장 그림 — design/characters-battle.html 의 token()·man()·rider()·thex() 를 옮긴 것.
 * 부대 = 장수기 + 2등신 병사 3명 + 헥스 받침 (병력 막대·선택 고리·상태 인장은 캔버스에서 따로 그린다).
 * SVG 를 한 번 이미지로 만들어 캐시하고 캔버스에 찍는다.
 */
import type { UnitKind } from '../../engine/battle/types';

const INK = '#3A2A20';
const WOOD = '#7A5A3A';
const STEEL = '#E2DFD2';
const ARM = '#7A7060';
const USKIN = '#F2D2AE';

function rnd(s: number): number {
  const t = Math.sin(s * 127.1 + 11.7) * 43758.5453;
  return t - Math.floor(t);
}
function inkOn(c: string): string {
  const n = [1, 3, 5].map((i) => parseInt(c.substr(i, 2), 16) / 255);
  return n[0]! * 0.299 + n[1]! * 0.587 + n[2]! * 0.114 > 0.62 ? '#1A1916' : '#EEE8D7';
}
const L = (d: string, c: string, w: number, extra = '') => `<path d="${d}" fill="none" stroke="${c}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"${extra}/>`;
const F = (d: string, fill: string, sw = 1.3) => `<path d="${d}" fill="${fill}" stroke="${INK}" stroke-width="${sw}" stroke-linejoin="round"/>`;
const uc = (cx: number, cy: number, r: number, fill: string, sw = 1.3) => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}" stroke="${INK}" stroke-width="${sw}"/>`;

interface ManOpts {
  fc: string;
  weapon?: 'spear' | 'bow';
  shield?: string;
  seated?: boolean;
}
function chibiHead(o: ManOpts, cx: number, cy: number): string {
  let s = uc(cx, cy, 8.6, USKIN);
  s += F(`M${cx - 9},${cy - 1} Q${cx},${cy - 17} ${cx + 9},${cy - 1} Q${cx},${cy - 5} ${cx - 9},${cy - 1}Z`, o.fc) + uc(cx, cy - 10, 2.2, o.fc, 1);
  s += `<circle cx="${cx - 3}" cy="${cy + 2}" r="1.35" fill="${INK}"/><circle cx="${cx + 3.2}" cy="${cy + 2}" r="1.35" fill="${INK}"/>`;
  s += `<ellipse cx="${cx - 5.4}" cy="${cy + 4.6}" rx="1.8" ry="1" fill="#EE8A86" opacity=".7"/><ellipse cx="${cx + 5.6}" cy="${cy + 4.6}" rx="1.8" ry="1" fill="#EE8A86" opacity=".7"/>`;
  return s;
}
function man(o: ManOpts): string {
  let s = '';
  if (!o.seated) s += L('M-3,-5 L-3,0 M3,-5 L3,0', INK, 3.4);
  if (o.weapon === 'spear') s += L('M9.5,-42 L7.5,-1', WOOD, 2.2) + F('M8,-41 L10,-50 L12,-41Z', STEEL, 0.9) + uc(9.6, -39.5, 1.6, o.fc, 0.7);
  if (o.weapon === 'bow') s += L('M10,-28 Q20,-16 10,-4', WOOD, 2.4) + L('M10,-28 L10,-4', '#FFF8EA', 0.8);
  s += F('M-6.5,-15 Q-7.8,-4 -5,-3.5 L5,-3.5 Q7.8,-4 6.5,-15 Q0,-17.5 -6.5,-15Z', ARM);
  s += F('M-7,-9.5 L7,-9.5 L7,-6.8 L-7,-6.8Z', o.fc, 0.9);
  s += uc(7, -10.5, 2.4, USKIN, 1);
  if (o.shield) s += F('M-12.5,-17 Q-12.5,-3 -9,-3 L-5,-3 Q-4,-3 -4,-17Z', o.shield) + uc(-8.2, -10, 1.6, '#E3B34A', 0.7);
  s += chibiHead(o, 0, -24);
  return s;
}
function horse(): string {
  const c = '#9A6A44';
  let s = F('M-14,-14 Q-23,-12 -21,-3 Q-17,-8 -13,-9Z', '#4A3020');
  s += L('M-9,-6 L-9,0 M-4,-6 L-4,0 M5,-6 L5,0 M10,-6 L10,0', INK, 3.6);
  s += `<ellipse cx="0" cy="-11" rx="14" ry="8.4" fill="${c}" stroke="${INK}" stroke-width="1.3"/>`;
  s += F('M7,-15 Q11,-22 13,-25 L19,-22 Q16,-14 12,-11Z', c);
  s += `<ellipse cx="17" cy="-23" rx="6.6" ry="5.2" fill="${c}" stroke="${INK}" stroke-width="1.3"/>`;
  s += F('M13,-27 L14.5,-32 L16.5,-26.5Z', c, 1) + F('M9,-24 Q8,-30 13,-28 Q12,-21 9.5,-18Z', '#4A3020', 1);
  s += `<circle cx="18.6" cy="-24" r="1.2" fill="${INK}"/><circle cx="22" cy="-21.4" r=".7" fill="${INK}"/>`;
  return s;
}
function rider(fc: string): string {
  return horse() + L('M-3,-17 L-1,-11', INK, 3) + `<g transform="translate(-1,-11)">${man({ fc, weapon: 'spear', seated: true })}</g>`;
}

const HEX = (() => {
  const p: string[] = [];
  for (let k = 0; k < 6; k++) {
    const a = (Math.PI / 180) * (60 * k - 30);
    p.push((60 + 52 * Math.cos(a)).toFixed(1) + ',' + (60 + 52 * Math.sin(a)).toFixed(1));
  }
  return p.join(' ');
})();

/** 부대 그림 (120×118): 받침 + 장수기 + 병사 */
function tokenSvg(fc: string, hz: string, kind: UnitKind, flip: boolean, confused: boolean): string {
  let s = `<polygon points="${HEX}" fill="rgba(216,214,193,.55)" stroke="rgba(26,25,22,.25)" stroke-width="1"/>`;
  s += `<polygon points="${HEX}" fill="none" stroke="${fc}" stroke-width="4" opacity=".9"/>`;
  s += L('M26,92 L26,18', WOOD, 2.2) + F('M26,18 L50,20 L48,44 L26,42Z', fc, 1);
  s += `<text x="37" y="37" font-family="Noto Serif KR, serif" font-weight="900" font-size="15" fill="${inkOn(fc)}" text-anchor="middle">${hz}</text>`;
  const tf = flip ? ' scale(-1,1)' : '';
  if (kind === 'cavalry') {
    ([[52, 86], [84, 84]] as const).forEach(([x, y], i) => {
      s += `<g transform="translate(${x + (confused ? [-6, 8][i]! : 0)},${y}) scale(1.15)${tf}${confused ? ` rotate(${[-25, 18][i]})` : ''}">${rider(fc)}</g>`;
    });
  } else {
    const g = kind === 'archer' ? man({ fc, weapon: 'bow' }) : man({ fc, weapon: 'spear', shield: '#4A5A48' });
    ([[48, 84], [70, 90], [90, 80]] as const).forEach(([x, y], i) => {
      s += `<g transform="translate(${x + (confused ? [-6, 8, 4][i]! : 0)},${y}) scale(1.15)${tf}${confused ? ` rotate(${[-25, 18, -10][i]})` : ''}">${g}</g>`;
    });
  }
  if (confused) s += L('M60,22 m-10,0 a10,6 0 1,0 20,0 a7,4 0 1,0 -14,0 a4,2 0 1,0 8,0', '#EEE8D7', 2);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 118">${s}</svg>`;
}

// ───────────────────────────── 지형 9종 (사각 칸용) ─────────────────────────────

export type TileKind = 'plain' | 'forest' | 'mount' | 'river' | 'bridge' | 'marsh' | 'wall' | 'gate' | 'camp' | 'town';
const TILE_COL: Record<TileKind, string> = {
  plain: '#D8D6C1', forest: '#A7AE8C', mount: '#C6B894', river: '#7F9DA3', bridge: '#7F9DA3', marsh: '#9DA58C', wall: '#6E6556', gate: '#6E6556', camp: '#D8D6C1', town: '#B7AE98',
};
function tileSvg(kind: TileKind): string {
  let s = `<rect width="120" height="120" fill="${TILE_COL[kind]}"/>`;
  let k: number;
  if (kind === 'plain') for (k = 0; k < 7; k++) s += L(`M${20 + rnd(k) * 80},${24 + rnd(k + 9) * 74} l2,-5 l2,5`, 'rgba(90,100,60,.55)', 1.4);
  if (kind === 'forest')
    for (k = 0; k < 9; k++) {
      const fx = 24 + (k % 3) * 34 + rnd(k) * 6;
      const fy = 26 + Math.floor(k / 3) * 32 + rnd(k + 3) * 6;
      s += L(`M${fx},${fy + 8} L${fx},${fy + 14}`, '#4A3A26', 2) + `<circle cx="${fx}" cy="${fy}" r="9" fill="#4E6040" stroke="${INK}" stroke-width="1"/>`;
    }
  if (kind === 'mount') s += F('M10,104 L42,30 L62,64 L80,40 L112,104Z', '#B3A37C', 1.4) + L('M42,30 L36,64 M80,40 L74,68', 'rgba(26,25,22,.45)', 1.4) + F('M37,42 L42,30 L47,42Z', '#EEE8D7', 0.8);
  if (kind === 'river' || kind === 'bridge') for (k = 0; k < 6; k++) s += L(`M${6 + (k % 2) * 10},${14 + k * 18} q8,-4 16,0 t16,0 t16,0 t16,0 t16,0 t16,0`, 'rgba(238,232,215,.55)', 1.4);
  if (kind === 'bridge') {
    s += F('M0,50 L120,50 L120,70 L0,70Z', '#8A6A44', 1.2);
    for (k = 0; k < 12; k++) s += L(`M${5 + k * 10},50 L${5 + k * 10},70`, 'rgba(26,25,22,.4)', 1);
  }
  if (kind === 'marsh') {
    s += '<ellipse cx="40" cy="44" rx="18" ry="8" fill="#6F8A86"/><ellipse cx="80" cy="82" rx="16" ry="7" fill="#6F8A86"/>';
    for (k = 0; k < 7; k++) s += L(`M${22 + k * 13},${76 - (k % 2) * 40} l0,-12 M${24 + k * 13},${76 - (k % 2) * 40} l3,-9`, '#4E5A3A', 1.3);
  }
  if (kind === 'wall' || kind === 'gate') {
    for (let r = 0; r < 8; r++) for (k = 0; k < 8; k++) s += `<rect x="${k * 16 - (r % 2) * 8}" y="${16 + r * 13}" width="15" height="12" fill="none" stroke="rgba(26,25,22,.35)"/>`;
    s += F('M0,8 L120,8 L120,16 L0,16Z', '#5A5246', 1);
    for (k = 0; k < 7; k++) s += `<rect x="${4 + k * 17}" y="0" width="9" height="9" fill="#5A5246" stroke="${INK}" stroke-width="1"/>`;
  }
  if (kind === 'gate') s += F('M38,118 L38,64 Q60,40 82,64 L82,118Z', '#4A3420', 1.4) + L('M60,52 L60,118', 'rgba(195,161,92,.6)', 1.4);
  if (kind === 'camp') {
    for (k = 0; k < 14; k++) {
      const a = (k / 14) * Math.PI * 2;
      s += L(`M${60 + Math.cos(a) * 44},${66 + Math.sin(a) * 38} l0,-10`, '#6B5A3E', 2.4);
    }
    s += F('M42,82 L60,50 L78,82Z', '#C9C6B4', 1.4) + L('M60,50 L60,36', WOOD, 1.6) + F('M60,36 L74,40 L60,44Z', '#A93526', 0.8);
  }
  if (kind === 'town') for (k = 0; k < 4; k++) s += `<rect x="${16 + (k % 2) * 52}" y="${18 + Math.floor(k / 2) * 52}" width="34" height="30" fill="#A79D86" stroke="rgba(26,25,22,.35)"/><path d="M${14 + (k % 2) * 52},${20 + Math.floor(k / 2) * 52} L${33 + (k % 2) * 52},${8 + Math.floor(k / 2) * 52} L${52 + (k % 2) * 52},${20 + Math.floor(k / 2) * 52}Z" fill="#6E6556"/>`;
  s += '<rect width="120" height="120" fill="none" stroke="rgba(26,25,22,.12)"/>';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120">${s}</svg>`;
}

// ───────────────────────────── 이미지 캐시 ─────────────────────────────

const cache = new Map<string, HTMLImageElement>();
let onLoad: (() => void) | null = null;
/** 이미지가 로드되면 다시 그리도록 알림 받기 */
export function setSpriteLoadListener(fn: (() => void) | null): void {
  onLoad = fn;
}
function image(key: string, svg: () => string): HTMLImageElement {
  let img = cache.get(key);
  if (!img) {
    img = new Image();
    img.onload = () => onLoad?.();
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg());
    cache.set(key, img);
  }
  return img;
}

export function unitSprite(fc: string, hz: string, kind: UnitKind, flip: boolean, confused: boolean): HTMLImageElement {
  return image(`u|${fc}|${hz}|${kind}|${flip ? 1 : 0}|${confused ? 1 : 0}`, () => tokenSvg(fc, hz, kind, flip, confused));
}

export function tileSprite(kind: TileKind): HTMLImageElement {
  return image(`t|${kind}`, () => tileSvg(kind));
}
