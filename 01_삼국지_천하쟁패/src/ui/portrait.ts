/**
 * 조립식 SD 초상 생성기 — design/characters-battle.html 의 portrait() 를 옮긴 것.
 * 같은 무장 ID는 언제나 같은 얼굴. face 데이터가 없으면 능력치 기반 자동 규칙으로 만든다.
 * 결과는 SVG data URI 로 캐시한다 (목록에 수백 명이 떠도 한 번만 조립).
 */
import type { Officer } from '../data/schema';

const INK = '#3A2A20';
export const SKIN: Record<string, string> = {
  base: '#E0C29E', warm: '#D6B38D', light: '#E9CFAE', tan: '#CFA985', red: '#A9473C', dark: '#B38660', bronze: '#A7744E',
};

export interface FaceOpts {
  age?: number;
  fc?: string;
  skin?: string; // SKIN 키 또는 색
  hairColor?: string;
  beard?: string;
  keepBeard?: boolean;
  shape?: string;
  expr?: 'neutral' | 'angry' | 'smile' | 'hurt';
  seed?: number;
  head?: string;
  body?: string;
  metal?: string;
  scarf?: string;
  robe?: string;
  border?: string;
  sash?: string;
  bigEars?: boolean;
  eyes?: string;
  eyeColor?: string;
  brows?: string;
  beardColor?: string;
  mouth?: string;
  plume?: string;
  hoodColor?: string;
  bandColor?: string;
  band2?: string;
  patch?: string;
  scar?: boolean;
  earring?: boolean;
  fan?: boolean;
  whisk?: boolean;
  crop?: string;
}

function rnd(s: number): number {
  const t = Math.sin(s * 127.1 + 11.7) * 43758.5453;
  return t - Math.floor(t);
}
export function hash(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) % 100000;
  return h;
}
function shade(hex: string, f: number): string {
  const n = [1, 3, 5].map((i) => parseInt(hex.substr(i, 2), 16));
  return '#' + n.map((v) => ('0' + Math.round(f < 0 ? v * (1 + f) : v + (255 - v) * f).toString(16)).slice(-2)).join('');
}

const SHAPES: Record<string, [number, number, number, number]> = {
  oval: [58, 62, 174, 0.55], square: [60, 62, 172, 0.85], long: [54, 58, 178, 0.5], round: [62, 62, 172, 0.68], small: [54, 66, 168, 0.55],
};
const pathStroke = (d: string, c: string, w: number, extra = '') =>
  `<path d="${d}" fill="none" stroke="${c}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"${extra}/>`;
const P = (d: string, fill: string, sw = 2.6) => `<path d="${d}" fill="${fill}" stroke="${INK}" stroke-width="${sw}" stroke-linejoin="round"/>`;
const cir = (cx: number, cy: number, r: number, fill: string, sw?: number) =>
  `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}"${sw === 0 ? '' : ` stroke="${INK}" stroke-width="${sw || 2.6}"`}/>`;
const ell = (cx: number, cy: number, rx: number, ry: number, fill: string, op?: number) =>
  `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${fill}"${op != null ? ` opacity="${op}"` : ''}/>`;
const HL = '<circle cx="2.8" cy="-4" r="3.4" fill="#fff"/><circle cx="-2.6" cy="3.6" r="1.6" fill="#fff"/>';

function eyeSvg(kind: string, ec: string): string {
  switch (kind) {
    case 'sharp': return `<path d="M-9,-3 L10,-7 Q10,10 0,10 Q-9,10 -9,-3Z" fill="${ec}"/><circle cx="3" cy="-1" r="2.6" fill="#fff"/>`;
    case 'phoenix': return `<path d="M-11,3 Q-2,-5 13,-8 Q6,7 -11,3Z" fill="${ec}"/><circle cx="4" cy="-3" r="1.8" fill="#fff"/>`;
    case 'round': return `<circle r="11" fill="#fff" stroke="${INK}" stroke-width="2.4"/><circle cx="1" cy="1" r="4.6" fill="${ec}"/><circle cx="2.4" cy="-.6" r="1.4" fill="#fff"/>`;
    case 'narrow': return pathStroke('M-9,2 Q0,-5 10,0', ec, 3.8);
    case 'gentle': return `<ellipse rx="8" ry="10.5" fill="${ec}"/>` + HL + pathStroke('M6,-8 L11,-12', INK, 2.2) + pathStroke('M8,-5 L13,-7', INK, 2);
    case 'happy': return pathStroke('M-9,4 Q0,-8 9,4', INK, 3.8);
    case 'teary': return `<ellipse rx="8" ry="10.5" fill="${ec}"/>` + HL + `<path d="M5,10 Q9,17 5,21 Q1,17 5,10Z" fill="#7FB6D9" stroke="${INK}" stroke-width="1.2"/>`;
    default: return `<ellipse rx="8" ry="11" fill="${ec}"/>` + HL;
  }
}
const BROWS: Record<string, [string, number]> = {
  thin: ['M-7,1 Q0,-3 7,0', 3], thick: ['M-8,2 Q0,-3 8,-1', 5.6], fierce: ['M-8,4 L8,-4', 5.6],
  bushy: ['M-10,3 L-5,-4 L0,1 L5,-5 L10,0', 4.8], soft: ['M-7,1 Q0,-2 7,0', 2.4],
};

/** SVG 문자열 조립 (디자인 문서의 portrait() 와 같은 규칙) */
export function portraitSvg(o: FaceOpts): string {
  const age = o.age ?? 38;
  const fc = o.fc ?? '#3E7D5A';
  const skin = o.skin ? SKIN[o.skin] ?? o.skin : SKIN.base!;
  let hc = o.hairColor ?? '#2B211B';
  if (age >= 68) hc = '#ECE8DE';
  else if (age >= 55) hc = '#A8A49A';
  let beard = o.beard ?? 'none';
  if (age < 24 && !o.keepBeard) beard = 'none';
  const [w, top, bot, jaw] = SHAPES[o.shape ?? 'oval'] ?? SHAPES.oval!;
  const ex = o.expr ?? 'neutral';
  const seed = o.seed ?? 1;
  const s: string[] = [];
  s.push(
    '<defs><linearGradient id="pv" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".55"/></linearGradient>' +
      '<radialGradient id="pglow" cx=".42" cy=".38" r=".7"><stop offset="0" stop-color="#EEE8D7" stop-opacity=".22"/><stop offset="1" stop-color="#EEE8D7" stop-opacity="0"/></radialGradient></defs>',
  );
  s.push(`<rect width="200" height="240" fill="${fc}"/><rect width="200" height="240" fill="url(#pglow)"/>`);
  for (let i = 0; i < 7; i++)
    s.push(cir(+(rnd(i * 3 + seed) * 200).toFixed(1), +(rnd(i * 7 + seed) * 240).toFixed(1), +(8 + rnd(i + seed) * 22).toFixed(1), '#FFFFFF', 0).replace('/>', ' opacity=".08"/>'));
  if (o.head === 'scholar')
    s.push(
      P(`M128,${top + 20} Q162,${top + 60} 152,${top + 128} L141,${top + 124} Q148,${top + 64} 120,${top + 28}Z`, '#2A3540', 2.2),
      P(`M72,${top + 20} Q38,${top + 60} 48,${top + 128} L59,${top + 124} Q52,${top + 64} 80,${top + 28}Z`, '#2A3540', 2.2),
    );
  if (o.head === 'woman') s.push(P('M46,122 Q34,182 58,216 L76,206 Q60,172 64,126Z', hc), P('M154,122 Q166,182 142,216 L124,206 Q140,172 136,126Z', hc));
  const bodyD = 'M44,240 C46,212 66,196 100,196 C134,196 154,212 156,240Z';
  if (o.body === 'armor') {
    const metal = o.metal ?? '#6A6254';
    s.push(P(bodyD, metal));
    s.push(pathStroke('M62,222 Q100,232 138,222', 'rgba(255,255,255,.28)', 2.4), pathStroke('M58,234 Q100,244 142,234', 'rgba(255,255,255,.2)', 2.4));
    s.push(cir(56, 212, 16, shade(metal, 0.18)), cir(144, 212, 16, shade(metal, 0.18)));
    s.push(cir(56, 212, 3, '#E3B34A', 0), cir(144, 212, 3, '#E3B34A', 0));
    s.push(P('M78,198 Q100,212 122,198 L118,209 Q100,221 82,209Z', o.scarf ?? fc));
  } else if (o.body === 'tribal') {
    s.push(P(bodyD, skin));
    s.push(P('M44,240 C46,214 58,202 74,198 L82,240Z', '#7A5230'));
    for (let t = 0; t < 7; t++) {
      const tx = 84 + t * 5.4;
      const ty = 206 + Math.sin((t / 6) * Math.PI) * 8;
      s.push(P(`M${tx - 2.4},${ty} L${tx},${ty + 7} L${tx + 2.4},${ty}Z`, '#FFF8EA', 1.2));
    }
  } else {
    const robe = o.robe ?? shade(fc, -0.3);
    s.push(P(bodyD, robe));
    s.push(P('M84,197 L100,228 L116,197 L109,197 L100,215 L91,197Z', '#F6F1E4', 2));
    if (o.body === 'ruler') s.push(pathStroke('M82,199 L100,232 L118,199', '#E3B34A', 3.6));
    if (o.body === 'woman') s.push(P('M52,226 Q100,216 148,226 L148,236 Q100,226 52,236Z', o.sash ?? '#E3B34A', 2.2));
    if (o.border) s.push(pathStroke('M80,199 L100,234 L120,199', o.border, 5));
  }
  s.push(P('M90,166 L90,202 Q100,208 110,202 L110,166Z', skin, 2.2));
  const covered = o.head === 'helmet' || o.head === 'hood';
  const er = o.bigEars ? 15 : 10;
  if (!covered) {
    s.push(cir(100 - w + 1, 130, er, skin), cir(100 + w - 1, 130, er, skin));
    s.push(pathStroke(`M${100 - w - 3},126 q3,4 0,8`, 'rgba(58,42,32,.45)', 2), pathStroke(`M${100 + w + 3},126 q-3,4 0,8`, 'rgba(58,42,32,.45)', 2));
  }
  const face = `M${100 - w},118 C${100 - w},${top + 10} ${100 - w * 0.55},${top} 100,${top} C${100 + w * 0.55},${top} ${100 + w},${top + 10} ${100 + w},118 C${100 + w},${bot - 16} ${100 + w * jaw},${bot} 100,${bot} C${100 - w * jaw},${bot} ${100 - w},${bot - 16} ${100 - w},118Z`;
  s.push(P(face, skin));
  const blush = skin === SKIN.red ? '#6E2018' : '#EE8A86';
  s.push(ell(64, 152, 11, 6.5, blush, 0.5), ell(136, 152, 11, 6.5, blush, 0.5));
  if (!covered) {
    s.push(
      P(
        `M${100 - w - 4},134 C${100 - w - 8},${top - 16} ${100 + w + 8},${top - 16} ${100 + w + 4},134 C${100 + w - 2},112 ${100 + w - 14},${top + 40} 124,${top + 36} Q114,${top + 48} 106,${top + 34} Q100,${top + 46} 92,${top + 34} Q84,${top + 48} 76,${top + 36} C${100 - w + 14},${top + 40} ${100 - w + 2},112 ${100 - w - 4},134Z`,
        hc,
      ),
    );
    s.push(pathStroke(`M68,${top + 10} Q84,${top - 2} 104,${top - 2}`, 'rgba(255,255,255,.28)', 3.4));
    if (o.head !== 'woman' && o.head !== 'nanman' && o.head !== 'scholar') s.push(cir(100, top - 12, 14, hc), pathStroke(`M88,${top - 4} L112,${top - 4}`, '#E3B34A', 3.2));
  }
  const ek = ex === 'smile' ? 'happy' : ex === 'hurt' ? 'teary' : o.eyes ?? 'calm';
  const ec = o.eyeColor ?? INK;
  if (o.patch !== 'left') s.push(`<g transform="translate(76,132) scale(-1,1)">${eyeSvg(ek, ec)}</g>`);
  s.push(`<g transform="translate(124,132)">${eyeSvg(ek, ec)}</g>`);
  const bd = BROWS[o.brows ?? 'thin'] ?? BROWS.thin!;
  const bpath = ex === 'angry' ? 'M-9,5 L9,-5' : ex === 'hurt' ? 'M-8,-3 L8,3' : bd[0];
  const bw = ex === 'angry' ? Math.max(bd[1], 5) : bd[1];
  const bcol = hc === '#ECE8DE' ? '#A8A49A' : hc;
  const brow = pathStroke(bpath, bcol, bw);
  s.push(`<g transform="translate(76,110) scale(-1,1)">${brow}</g><g transform="translate(124,110)">${brow}</g>`);
  s.push(pathStroke('M97,144 Q100,147 103,144', 'rgba(58,42,32,.55)', 2.2));
  if (age >= 55) s.push(pathStroke('M140,126 l6,-2 M140,134 l6,1', 'rgba(58,42,32,.4)', 2), pathStroke('M60,126 l-6,-2 M60,134 l-6,1', 'rgba(58,42,32,.4)', 2));
  const bc = o.beardColor && age < 55 ? o.beardColor : hc;
  const must = P('M84,152 Q90,143 100,149 Q110,143 116,152 Q108,155 100,153 Q92,155 84,152Z', bc, 2.2);
  const goat = P(`M92,${bot - 4} Q100,${bot + 18} 108,${bot - 4} Q100,${bot + 2} 92,${bot - 4}Z`, bc, 2.2);
  const spiky = (() => {
    const pts: string[] = [];
    for (let k = 0; k <= 16; k++) {
      const a = Math.PI * (0.06 + (0.88 * k) / 16);
      const rr = k % 2 ? 70 : 58;
      pts.push((100 + Math.cos(a) * rr * 1.02).toFixed(1) + ',' + (126 + Math.sin(a) * rr * 0.82).toFixed(1));
    }
    return P(`M${pts.join(' L')} Q100,${bot - 14} ${pts[0]}Z`, bc, 2.4) + P('M80,152 L88,144 L94,150 L100,145 L106,150 L112,144 L120,152 L110,156 L100,154 L90,156Z', bc, 2);
  })();
  const B: Record<string, string> = {
    none: '', mustache: must, goatee: goat, mg: must + goat,
    full: P(`M${100 - w + 6},142 Q${100 - w + 4},${bot + 6} 100,${bot + 12} Q${100 + w - 4},${bot + 6} ${100 + w - 6},142 Q${100 + w - 16},166 100,168 Q${100 - w + 16},166 ${100 - w + 6},142Z`, bc) + must,
    long: P('M74,158 Q64,198 84,230 Q100,250 116,230 Q136,198 126,158 Q114,172 100,172 Q86,172 74,158Z', bc) + pathStroke('M92,184 Q94,208 98,228 M108,184 Q106,208 102,228', 'rgba(255,255,255,.22)', 2.4) + must,
    thin3: pathStroke('M94,151 Q88,153 84,160', bc, 2.8) + pathStroke('M106,151 Q112,153 116,160', bc, 2.8) + pathStroke(`M100,${bot} Q98,${bot + 12} 101,${bot + 22}`, bc, 3.6),
    spiky,
  };
  s.push(B[beard] ?? '');
  let mouth = o.mouth ?? 'neutral';
  if (ex === 'angry') mouth = 'shout';
  else if (ex === 'smile') mouth = 'smile';
  else if (ex === 'hurt') mouth = 'frown';
  const M: Record<string, string> = {
    neutral: pathStroke('M94,160 Q100,163 106,160', INK, 2.6),
    smile: P('M90,156 Q100,158 110,156 Q108,170 100,170 Q92,170 90,156Z', '#B8483E', 2.2) + ell(100, 166, 5, 2.6, '#E58080'),
    frown: pathStroke('M93,163 Q100,157 107,163', INK, 2.6),
    shout: P('M88,154 Q100,151 112,154 Q110,176 100,176 Q90,176 88,154Z', '#8E2E26', 2.4) + '<path d="M92,155 L95,161 L98,155Z" fill="#fff"/><path d="M102,155 L105,161 L108,155Z" fill="#fff"/>',
    smug: pathStroke('M91,159 Q95.5,164 100,159 Q104.5,164 109,159', INK, 2.6),
    lips: `<path d="M95,159 Q100,155 105,159 Q100,165 95,159Z" fill="#D2505E" stroke="${INK}" stroke-width="1.4"/>`,
  };
  s.push(M[mouth] ?? M.neutral!);
  const metalH = o.metal ?? '#6A6254';
  const hood = o.hoodColor ?? '#3E8A5A';
  const H: Record<string, () => string> = {
    guan: () => P(`M88,${top - 8} L112,${top - 8} L110,${top - 34} Q100,${top - 38} 90,${top - 34}Z`, '#2B211B') + pathStroke(`M72,${top - 20} L128,${top - 20}`, '#E3B34A', 3.6) + cir(128, top - 20, 4, '#E3B34A', 0) + cir(72, top - 20, 4, '#E3B34A', 0),
    crown: () => P(`M76,${top + 6} L78,${top - 20} L89,${top - 9} L100,${top - 30} L111,${top - 9} L122,${top - 20} L124,${top + 6}Z`, '#E3B34A') + cir(100, top - 4, 5.5, '#C8434A', 2) + cir(80, top - 20, 3, '#FFF3C4', 1.4) + cir(120, top - 20, 3, '#FFF3C4', 1.4),
    helmet: () =>
      P(`M${100 - w - 8},122 Q${100 - w - 14},150 ${100 - w + 2},160 L${100 - w + 6},124Z`, metalH) +
      P(`M${100 + w + 8},122 Q${100 + w + 14},150 ${100 + w - 2},160 L${100 + w - 6},124Z`, metalH) +
      P(`M${100 - w - 8},124 C${100 - w - 12},${top - 34} ${100 + w + 12},${top - 34} ${100 + w + 8},124 C${100 + w - 6},106 ${100 + w - 20},${top + 30} 100,${top + 30} C${100 - w + 20},${top + 30} ${100 - w + 6},106 ${100 - w - 8},124Z`, metalH) +
      pathStroke(`M${100 - w + 2},${top + 26} Q100,${top + 8} ${100 + w - 2},${top + 26}`, '#E3B34A', 7) +
      pathStroke(`M70,${top - 6} Q88,${top - 20} 106,${top - 20}`, 'rgba(255,255,255,.3)', 4) +
      pathStroke(`M100,${top - 20} L100,${top - 32}`, INK, 3) + cir(100, top - 38, 11, o.plume ?? '#D2454A'),
    hood: () =>
      P(`M${100 - w - 8},128 C${100 - w - 14},${top - 30} ${100 + w + 14},${top - 30} ${100 + w + 8},128 C${100 + w - 4},108 ${100 + w - 22},${top + 32} 100,${top + 32} C${100 - w + 22},${top + 32} ${100 - w + 4},108 ${100 - w - 8},128Z`, hood) +
      cir(100 + w + 4, top + 22, 11, hood) +
      P(`M${100 + w + 8},${top + 30} Q${100 + w + 24},${top + 52} ${100 + w + 18},${top + 74} L${100 + w + 8},${top + 70} Q${100 + w + 12},${top + 52} ${100 + w},${top + 34}Z`, hood, 2.2) +
      pathStroke(`M70,${top - 6} Q88,${top - 18} 108,${top - 18}`, 'rgba(255,255,255,.3)', 4),
    scholar: () => P(`M${100 - w + 2},${top + 28} C${100 - w - 4},${top - 26} ${100 + w + 4},${top - 26} ${100 + w - 2},${top + 28} Q100,${top + 12} ${100 - w + 2},${top + 28}Z`, '#3A4A5C') + pathStroke(`M74,${top + 2} Q100,${top - 10} 126,${top + 2}`, 'rgba(255,255,255,.3)', 3),
    band: () => bandSvg(w, top, o.bandColor ?? '#C8434A'),
    feather: () => {
      let z = '';
      ([[-1, `M90,${top - 16} C76,${top - 58} 46,${top - 66} 30,${top - 46}`], [1, `M110,${top - 16} C124,${top - 58} 154,${top - 66} 170,${top - 46}`]] as const).forEach(([side, d]) => {
        z += pathStroke(d, INK, 9) + pathStroke(d, '#E3B34A', 6) + pathStroke(d, '#B07A2A', 6, ' stroke-dasharray="3 7"') + cir(side < 0 ? 30 : 170, top - 46, 6, '#E3B34A', 2.2);
      });
      return z + P(`M80,${top + 4} Q80,${top - 22} 100,${top - 24} Q120,${top - 22} 120,${top + 4}Z`, '#C9973E') + cir(100, top - 8, 6, '#C8434A', 2);
    },
    woman: () =>
      cir(100, top - 12, 24, hc) + cir(100, top - 34, 12, hc) + pathStroke(`M74,${top - 18} L128,${top - 4}`, '#E3B34A', 3.4) + cir(128, top - 4, 4.5, '#E3B34A', 1.6) +
      pathStroke(`M128,${top} L130,${top + 18}`, '#E3B34A', 1.6) + cir(130, top + 21, 3, '#C8434A', 1.2) + cir(78, top + 4, 8, '#F2A0A8', 2) + cir(78, top + 4, 3, '#E3B34A', 0),
    nanman: () => {
      let z = '';
      for (let k = 0; k < 9; k++) {
        const a = Math.PI * (1.1 + (0.8 * k) / 8);
        const cx = 100 + Math.cos(a) * 60;
        const cy = top + 40 + Math.sin(a) * 58;
        z += `<ellipse cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" rx="8" ry="20" transform="rotate(${((a * 180) / Math.PI + 90).toFixed(1)} ${cx.toFixed(1)} ${cy.toFixed(1)})" fill="${['#D2454A', '#F0A53C', '#3E8A5A'][k % 3]}" stroke="${INK}" stroke-width="2.2"/>`;
      }
      return z + P(`M${100 - w},${top + 30} Q100,${top + 16} ${100 + w},${top + 30} L${100 + w},${top + 40} Q100,${top + 26} ${100 - w},${top + 40}Z`, '#E3B34A', 2.2);
    },
    mian: () => {
      let z = P(`M84,${top - 4} L116,${top - 4} L114,${top - 22} L86,${top - 22}Z`, '#2B211B') + P(`M58,${top - 30} L142,${top - 30} L138,${top - 20} L62,${top - 20}Z`, '#2B211B') + pathStroke(`M58,${top - 30} L142,${top - 30}`, '#E3B34A', 2.6);
      for (let k = 0; k < 9; k++) {
        const bx = 66 + k * 8.5;
        z += pathStroke(`M${bx},${top - 20} L${bx},${top + 2}`, 'rgba(43,33,27,.8)', 1.4) + cir(bx, top - 9, 2.4, '#E3B34A', 0) + cir(bx, top + 2, 2.6, '#F6F1E4', 1);
      }
      return z;
    },
    taoist: () => P(`M86,${top - 4} Q100,${top - 40} 114,${top - 4}Z`, '#B98A3E') + P(`M93,${top - 8} Q100,${top - 26} 107,${top - 8}Z`, '#E3B34A', 2) + pathStroke(`M76,${top - 10} L124,${top - 10}`, '#E3B34A', 3),
  };
  if (o.head && H[o.head]) s.push(H[o.head]!());
  if (o.band2) s.push(bandSvg(w, top, o.band2));
  if (o.patch === 'left') s.push(pathStroke(`M${100 - w - 2},104 L${100 + w + 2},${top + 40}`, INK, 3.4), cir(76, 132, 14, '#2B211B'));
  if (o.scar) s.push(`<g transform="rotate(-30 132 150)"><rect x="120" y="145" width="24" height="10" rx="4" fill="#F2D4A8" stroke="${INK}" stroke-width="1.6"/>${pathStroke('M130,147 L130,153 M134,147 L134,153', 'rgba(58,42,32,.4)', 1.2)}</g>`);
  if (o.earring) s.push(`<circle cx="${100 - w + 1}" cy="144" r="4.5" fill="none" stroke="#E3B34A" stroke-width="2"/><circle cx="${100 + w - 1}" cy="144" r="4.5" fill="none" stroke="#E3B34A" stroke-width="2"/>`);
  if (ex === 'hurt') s.push(P(`M${100 - w + 2},${top + 26} Q100,${top + 12} ${100 + w - 2},${top + 26} L${100 + w - 2},${top + 38} Q100,${top + 24} ${100 - w + 2},${top + 38}Z`, '#FFFDF5', 2.2), cir(122, top + 28, 4.5, '#D2454A', 0));
  if (ex === 'angry') s.push(pathStroke(`M150,${top + 6} l8,-4 M152,${top + 14} l9,0 M150,${top + 22} l8,4`, '#D2454A', 3));
  if (o.fan) s.push(pathStroke('M152,240 L158,206', '#7A5A3A', 5), P('M158,208 C128,192 130,150 158,138 C186,150 188,192 158,208Z', '#FFFDF5', 2.4) + pathStroke('M158,204 L148,160 M158,204 L158,148 M158,204 L168,160', 'rgba(58,42,32,.3)', 1.6));
  if (o.whisk) s.push(pathStroke('M44,240 L52,198', '#7A5A3A', 5) + P('M52,200 C38,172 48,150 62,146 C60,162 68,180 54,200Z', '#FFFDF5', 2.2));
  s.push('<rect width="200" height="240" fill="url(#pv)" opacity=".3"/>');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${o.crop ?? '0 0 200 240'}">${s.join('')}</svg>`;
}

function bandSvg(w: number, top: number, c: string): string {
  return (
    P(`M${100 - w - 2},${top + 30} Q100,${top + 16} ${100 + w + 2},${top + 30} L${100 + w + 2},${top + 42} Q100,${top + 28} ${100 - w - 2},${top + 42}Z`, c, 2.4) +
    P(`M${100 + w},${top + 34} Q${100 + w + 22},${top + 42} ${100 + w + 26},${top + 64} L${100 + w + 16},${top + 64} Q${100 + w + 12},${top + 48} ${100 + w - 2},${top + 42}Z`, c, 2.2)
  );
}

function pick<T>(arr: readonly T[], r: number): T {
  return arr[Math.floor(r * arr.length) % arr.length]!;
}

/** face 데이터가 없을 때: 능력치·ID로 얼굴을 정하는 자동 규칙 (디자인 문서의 autoFace) */
export function autoFace(o: Officer): FaceOpts {
  const h = hash(o.id);
  const r = (k: number) => rnd(h + k * 13.37);
  const armor = o.war >= 70 && o.war >= o.intelligence;
  const f: FaceOpts = { seed: h % 97 };
  f.body = armor ? 'armor' : 'robe';
  f.head = armor ? pick(['helmet', 'helmet', 'band', 'none'], r(1)) : o.politics >= 65 || o.intelligence >= 70 ? 'guan' : 'none';
  f.shape = pick(['oval', 'square', 'long', 'round'], r(2));
  f.eyes = o.ambition >= 9 ? 'sharp' : o.charisma >= 75 ? 'calm' : pick(['calm', 'narrow', 'round', 'sharp'], r(3));
  f.brows = o.war >= 80 ? 'fierce' : o.war >= 65 ? 'thick' : 'thin';
  f.beard = pick(['mustache', 'goatee', 'mg', 'full', 'long', 'thin3', 'mg'], r(4));
  f.mouth = o.charisma >= 75 ? 'smile' : o.ambition >= 10 ? 'frown' : 'neutral';
  f.skin = pick(['base', 'warm', 'light', 'tan', 'base'], r(5));
  f.hairColor = pick(['#1D1B18', '#2A2018', '#1D1B18'], r(7));
  if (armor && r(8) < 0.3) f.scar = true;
  if (f.head === 'band') f.bandColor = pick(['#A93526', '#1A1916', '#5B5A3A'], r(9));
  if (o.skills.includes('navy') && armor) {
    f.head = 'band';
    f.bandColor = '#2C5A6A';
  }
  f.metal = pick(['#45423B', '#4A4036', '#3E4440'], r(10));
  return f;
}

/** 무장 한 명의 얼굴 옵션: face 데이터가 있으면 그것을 자동 규칙 위에 덮어쓴다 */
export function faceOf(o: Officer): FaceOpts {
  const auto = autoFace(o);
  if (!o.face) return auto;
  return { ...auto, ...(o.face as FaceOpts), seed: auto.seed };
}

/** 쓰임별 자르기 (디자인 문서 '크기별 쓰임') */
export const CROP = { full: '0 0 200 240', card: '22 22 156 187', face: '38 60 124 124' } as const;
export type PortraitSize = 200 | 96 | 44;

const uriCache = new Map<string, string>();

/** 데이터 URI. age는 머리색·수염 단계(24/55/68세)로 묶어서 캐시 */
export function portraitUri(o: Officer, opts: { age: number; fc: string; crop: keyof typeof CROP; expr?: FaceOpts['expr']; gray?: boolean }): string {
  const ageBucket = opts.age < 24 ? 20 : opts.age < 55 ? 38 : opts.age < 68 ? 60 : 70;
  const key = `${o.id}|${ageBucket}|${opts.fc}|${opts.crop}|${opts.expr ?? ''}`;
  let uri = uriCache.get(key);
  if (!uri) {
    const svg = portraitSvg({ ...faceOf(o), age: ageBucket, fc: opts.fc, crop: CROP[opts.crop], expr: opts.expr });
    uri = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    uriCache.set(key, uri);
  }
  return uri;
}
