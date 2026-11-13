/*
 * 몬스터 클래스 — shared art generator (v0.2)
 * Used by the art book page (browser) and by export-assets.js (Node) so the PNGs
 * the game receives are exactly what the art book shows.
 * Every drawing is plain SVG markup (no CSS, no text) so it rasterises cleanly.
 */
(function (root) {
  'use strict';

  // ---------- colour helpers ----------
  const OUT = '#2a2350';
  const rgb = (h) => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
  const mix = (a, b, t) => '#' + rgb(a).map((v, i) => Math.round(v + (rgb(b)[i] - v) * t).toString(16).padStart(2, '0')).join('');
  const L = (c, t) => mix(c, '#ffffff', t);
  const D = (c, t) => mix(c, '#1b1236', t);
  let UID = 0;
  const uid = (p) => p + (++UID).toString(36);

  const TEAM = [
    { main: '#4f8bff', dark: '#2f5fc8', light: '#a9c6ff', name: 'blue' },
    { main: '#ff6b4a', dark: '#c8442c', light: '#ffb3a1', name: 'red' },
  ];
  const GOLD = '#f2c14e';

  const star4 = (x, y, r, f = '#ffe27a') =>
    `<path d="M${x} ${y - r}Q${x} ${y} ${x + r} ${y}Q${x} ${y} ${x} ${y + r}Q${x} ${y} ${x - r} ${y}Q${x} ${y} ${x} ${y - r}Z" fill="${f}" stroke="none"/>`;
  function star5(x, y, R, r) {
    const p = [];
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5, rr = i % 2 ? r : R;
      p.push((x + Math.cos(a) * rr).toFixed(1) + ' ' + (y + Math.sin(a) * rr).toFixed(1));
    }
    return 'M' + p.join('L') + 'Z';
  }
  const mirror = (s, cx = 80) => `${s}<g transform="translate(${cx * 2} 0) scale(-1 1)">${s}</g>`;
  const goldGrad = (id) => `<linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff1a8"/><stop offset=".5" stop-color="${GOLD}"/><stop offset="1" stop-color="#b8862a"/></linearGradient>`;
  const flameGrad = (id) => `<linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff6c0"/><stop offset=".45" stop-color="#ffb03a"/><stop offset="1" stop-color="#ff4a3c"/></linearGradient>`;
  const ballGrad = (id, c, k = 1) => `<radialGradient id="${id}" cx=".36" cy=".28" r=".85"><stop offset="0" stop-color="${L(c, 0.55 * k)}"/><stop offset=".5" stop-color="${c}"/><stop offset="1" stop-color="${D(c, 0.25)}"/></radialGradient>`;

  /** Resolve team placeholders: 'T' main, 'Td' dark, 'Tl' light. */
  function resolve(v, team) {
    const t = TEAM[team || 0];
    if (v === 'T') return t.main;
    if (v === 'Td') return t.dark;
    if (v === 'Tl') return t.light;
    if (Array.isArray(v)) return v.map((x) => resolve(x, team));
    if (v && typeof v === 'object') { const o = {}; for (const k in v) o[k] = resolve(v[k], team); return o; }
    return v;
  }

  // small cute face used on spells & buildings
  function cuteFace(x, y, s = 1, style = 'dot', ec = '#2a2350') {
    const ex = [x - 11 * s, x + 11 * s];
    let e = '';
    ex.forEach((X, i) => {
      if (style === 'happy') e += `<path d="M${X - 6 * s} ${y + 2 * s}q${6 * s} ${-8 * s} ${12 * s} 0" fill="none" stroke-width="3"/>`;
      else if (style === 'shut') { const d = i ? -1 : 1; e += `<path d="M${X - 5 * s * d} ${y - 4 * s}L${X + 4 * s * d} ${y}L${X - 5 * s * d} ${y + 4 * s}" fill="none" stroke-width="3"/>`; }
      else e += `<ellipse cx="${X}" cy="${y}" rx="${4.8 * s}" ry="${5.8 * s}" fill="${ec}" stroke="none"/><circle cx="${X + 1.7 * s}" cy="${y - 2.1 * s}" r="${1.8 * s}" fill="#fff" stroke="none"/>`;
    });
    const m = style === 'shut'
      ? `<path d="M${x - 6 * s} ${y + 7 * s}q${6 * s} ${12 * s} ${12 * s} 0z" fill="#8a2a4a" stroke-width="2.5"/>`
      : `<path d="M${x - 5 * s} ${y + 8 * s}q${5 * s} ${5 * s} ${10 * s} 0" fill="none" stroke-width="3"/>`;
    const b = `<ellipse cx="${x - 20 * s}" cy="${y + 6 * s}" rx="${6 * s}" ry="${3.6 * s}" fill="#ff6f9a" opacity=".5" stroke="none"/><ellipse cx="${x + 20 * s}" cy="${y + 6 * s}" rx="${6 * s}" ry="${3.6 * s}" fill="#ff6f9a" opacity=".5" stroke="none"/>`;
    return e + m + b;
  }

  // ======================================================================
  // CHARACTERS  (drawing space 0..160, feet at y≈140)
  // ======================================================================
  const SHAPES = {
    mochi: { d: 'M80 44C120 44 134 76 134 104C134 130 112 140 80 140C48 140 26 130 26 104C26 76 40 44 80 44Z', top: 44, ey: 94, half: 54 },
    round: { d: 'M80 48C112 48 128 72 128 100C128 128 108 140 80 140C52 140 32 128 32 100C32 72 48 48 80 48Z', top: 48, ey: 94, half: 48 },
    drop: { d: 'M80 32C88 52 112 68 124 90C138 118 118 140 80 140C42 140 22 118 36 90C48 68 72 52 80 32Z', top: 40, ey: 100, half: 46 },
    ghost: { d: 'M80 42C112 42 128 68 128 98V136Q120 128 112 136T96 136T80 136T64 136T48 136Q40 128 32 136V98C32 68 48 42 80 42Z', top: 42, ey: 90, half: 48, nofeet: 1 },
    square: { d: 'M46 46H114Q134 46 134 66V122Q134 140 114 140H46Q26 140 26 122V66Q26 46 46 46Z', top: 46, ey: 90, half: 54 },
    bean: { d: 'M80 42C108 42 122 66 120 98C118 128 106 140 80 140C54 140 42 128 40 98C38 66 52 42 80 42Z', top: 42, ey: 90, half: 40 },
  };
  const CHAR_VB = '-6 -16 172 172';

  /**
   * pose: { sx, sy, rot, dy } applied around the feet — used for animation frames.
   */
  function charArt(spec, team = 0, pose) {
    const a = resolve(spec, team);
    const U = uid('c');
    const c = a.c, sh = SHAPES[a.shape || 'mochi'], out = D(c, 0.62);
    const { top, half } = sh;
    const ey = a.ey || sh.ey, g = a.gap || Math.round(half * 0.42), k = half / 54;
    const hx = 80 + half - 6, hy = sh.ey + 26, lx = 80 - half + 6;
    const ex = a.extra || [];
    const has = (x) => ex.includes(x);
    const rc = a.rc || TEAM[team].dark, hcol = a.hc || '#3b3f8f';
    const B = `url(#${U}b)`;

    const defs =
      ballGrad(U + 'b', c) +
      `<radialGradient id="${U}i" cx=".45" cy=".3" r=".8"><stop offset="0" stop-color="${a.iris || '#7a6be0'}"/><stop offset=".7" stop-color="${D(a.iris || '#7a6be0', 0.55)}"/><stop offset="1" stop-color="#140e2c"/></radialGradient>` +
      `<linearGradient id="${U}h" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${L(hcol, 0.3)}"/><stop offset="1" stop-color="${D(hcol, 0.3)}"/></linearGradient>` +
      goldGrad(U + 'g') + flameGrad(U + 'f') +
      `<radialGradient id="${U}o" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#fff"/><stop offset=".4" stop-color="${a.oc || '#8be9ff'}"/><stop offset="1" stop-color="${D(a.oc || '#8be9ff', 0.3)}"/></radialGradient>` +
      `<linearGradient id="${U}r" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${L(rc, 0.18)}"/><stop offset="1" stop-color="${D(rc, 0.3)}"/></linearGradient>` +
      `<radialGradient id="${U}m" cx=".35" cy=".3" r=".9"><stop offset="0" stop-color="#ff8a7a"/><stop offset="1" stop-color="#c9302a"/></radialGradient>` +
      `<clipPath id="${U}c"><path d="${sh.d}"/></clipPath>`;

    const earT = `translate(0 ${top - 44}) translate(80 0) scale(${k} 1) translate(-80 0)`;
    const hatT = `translate(0 ${top - 44 + (a.hy || 0)})`;
    let back = '', clip = '', preface = '', face = '', front = '', top2 = '';

    // ---- behind the body ----
    if (a.tail === 'tail9') for (const ang of [-64, -32, 0, 32, 64]) back += `<g transform="rotate(${ang} 80 124)"><path d="M80 124Q60 70 80 20Q100 70 80 124Z" fill="${L(c, 0.15)}"/><path d="M80 46Q72 33 80 20Q88 33 80 46Z" fill="#ff8a5c" stroke="none"/></g>`;
    if (a.tail === 'cattail') back += `<path d="M122 126Q152 124 146 94Q142 82 132 90" fill="none" stroke-width="12"/><path d="M122 126Q152 124 146 94Q142 82 132 90" fill="none" stroke="${c}" stroke-width="6"/>`;
    if (a.tail === 'devil') back += `<path d="M120 128Q148 132 146 108" fill="none" stroke-width="4"/><path d="M146 100l-7 10h14z" fill="${D(c, 0.2)}"/>`;
    if (has('cape')) back += `<path d="M44 80Q28 124 18 150H142Q132 124 116 80Z" fill="${a.cc}"/><path d="M50 86Q40 120 34 146M110 86Q120 120 126 146" fill="none" stroke="${D(a.cc, 0.3)}" stroke-width="2"/>`;
    if (has('shell')) back += `<path d="M34 92L38 56L54 86Z" fill="#8ff0ea"/><path d="M52 76L62 34L78 72Z" fill="#c8fffa"/><path d="M82 72L98 34L108 76Z" fill="#8ff0ea"/><path d="M106 86L122 56L126 92Z" fill="#c8fffa"/>`;
    if (has('legs8')) { let s = ''; for (let i = 0; i < 4; i++) s += `<path d="M44 ${96 + i * 10}Q${18 - i * 2} ${78 + i * 12} ${8 + i * 2} ${108 + i * 12}" fill="none" stroke-width="5"/>`; back += mirror(s); }
    if (a.wings === 'bat') back += mirror(`<path d="M40 98Q10 68 2 100Q14 96 18 108Q26 98 34 110Q36 102 44 106Z" fill="${a.wc || D(c, 0.25)}"/>`);
    if (a.wings === 'feather') back += mirror(`<path d="M38 100Q4 88 4 118Q14 114 16 124Q24 116 28 126Q34 116 44 118Z" fill="${a.wc || D(c, 0.12)}"/><path d="M14 112Q26 108 34 112M18 120Q28 116 36 118" fill="none" stroke-width="2"/>`);
    if (a.wings === 'fairy') back += mirror(`<ellipse cx="34" cy="80" rx="24" ry="12" transform="rotate(-32 34 80)" fill="${a.wc || '#dff4ff'}" fill-opacity=".8"/><ellipse cx="32" cy="104" rx="15" ry="8" transform="rotate(22 32 104)" fill="${a.wc || '#dff4ff'}" fill-opacity=".8"/>`);
    if (a.wings === 'dragon') back += mirror(`<path d="M42 96Q22 46 0 70Q10 72 8 84Q18 80 18 92Q28 88 30 102Z" fill="${D(c, 0.18)}"/>`);

    const EARS = {
      cat: mirror(`<path d="M44 72L38 30L74 52Z" fill="${B}"/><path d="M48 64L44 40L64 53Z" fill="#ffa8c0" stroke="none"/>`),
      fox: mirror(`<path d="M44 74L34 22L76 52Z" fill="${B}"/><path d="M49 64L41 34L64 54Z" fill="#ffb59a" stroke="none"/>`),
      wolf: mirror(`<path d="M44 72L36 24L74 52Z" fill="${D(c, 0.08)}"/><path d="M48 64L42 36L64 53Z" fill="#f0c8d8" stroke="none"/>`),
      bunny: mirror(`<ellipse cx="60" cy="24" rx="11" ry="27" transform="rotate(-12 60 24)" fill="${B}"/><ellipse cx="60" cy="27" rx="5" ry="18" transform="rotate(-12 60 24)" fill="#ffb2cc" stroke="none"/>`),
      bear: mirror(`<circle cx="50" cy="56" r="15" fill="${B}"/><circle cx="50" cy="56" r="7" fill="${L(c, 0.5)}" stroke="none"/>`),
      smallears: mirror(`<ellipse cx="54" cy="52" rx="8" ry="10" fill="${B}"/>`),
      horn1: `<path d="M72 52Q76 10 92 48Z" fill="#fff0c2"/>`,
      horns: mirror(`<path d="M54 58Q42 26 68 48Z" fill="#fff0c2"/>`),
      tuft: mirror(`<path d="M44 66L34 28L68 50Z" fill="${D(c, 0.18)}"/>`),
      leaf: `<path d="M80 48Q80 32 84 24" fill="none"/><path d="M84 26Q70 8 60 22Q72 34 84 26Z" fill="#7ccf6a"/><path d="M84 26Q98 6 108 18Q98 32 84 26Z" fill="#9be07f"/>`,
      flame: `<path d="M64 54Q58 26 72 30Q74 8 86 26Q100 16 98 34Q108 40 98 54Z" fill="url(#${U}f)"/>`,
      antenna: mirror(`<path d="M68 50L56 20" fill="none"/><circle cx="55" cy="18" r="6" fill="${a.c2 || '#ffd34d'}"/>`),
      stem: `<path d="M78 50Q76 32 86 24" fill="none" stroke-width="9"/><path d="M78 50Q76 32 86 24" fill="none" stroke="#6b8f3a" stroke-width="4.5"/><path d="M84 32Q100 20 108 34Q96 40 84 32Z" fill="#7ccf6a"/>`,
      frog: mirror(`<circle cx="58" cy="54" r="17" fill="${B}"/>`),
      elf: mirror(`<path d="M30 96L8 80L30 108Z" fill="${B}"/>`),
    };
    const FRONT_EARS = {
      curl: [[46, 62, 15], [60, 46, 15], [80, 40, 16], [100, 46, 15], [114, 62, 15]].map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${L(c, 0.55)}"/>`).join(''),
      moss: `<path d="M28 66Q42 40 62 50Q72 34 92 46Q108 36 122 54Q130 60 132 68Q80 54 28 70Z" fill="#7cc36a"/>`,
    };
    if (a.ears && EARS[a.ears]) back += `<g transform="${earT}">${EARS[a.ears]}</g>`;
    const feet = sh.nofeet ? '' : mirror(`<ellipse cx="${80 - half * 0.36}" cy="140" rx="12" ry="7" fill="${D(c, 0.1)}"/>`);

    // ---- clipped to the body ----
    const plain = !a.robe && !has('paper') && !has('stripes') && !has('bookspine') && !has('bandage');
    if (a.bellyBig) clip += `<ellipse cx="80" cy="${ey + 18}" rx="${half * 0.78}" ry="46" fill="${a.belly}"/>`;
    else if (a.belly || plain) clip += `<ellipse cx="80" cy="${ey + 34}" rx="${half * 0.58}" ry="20" fill="${a.belly || L(c, 0.5)}" stroke="none" opacity="${a.belly ? 1 : 0.75}"/>`;
    if (has('paper')) clip += `<path d="M20 ${ey + 22}H140M20 ${ey + 32}H140M20 ${ey + 42}H140" stroke="#9ad0ff" stroke-width="1.6"/><path d="M80 30V150" stroke="#d9d2bf" stroke-width="2"/><path d="M98 ${ey + 28}l4 5 9-11" fill="none" stroke="#e8574a" stroke-width="3"/>`;
    if (has('stripes')) clip += `<rect x="0" y="${ey + 18}" width="160" height="11" fill="#2a2350" stroke="none"/><rect x="0" y="${ey + 38}" width="160" height="11" fill="#2a2350" stroke="none"/>`;
    if (has('ridges')) clip += `<path d="M58 48Q44 96 58 144M102 48Q116 96 102 144M80 44V144" fill="none" stroke="${D(c, 0.22)}" stroke-width="3"/>`;
    if (has('bandage')) clip += `<path d="M10 72L150 58M10 116L150 104M10 134L150 126M10 52L150 42" stroke="${D(c, 0.14)}" stroke-width="7" fill="none"/>`;
    if (has('bookspine')) clip += `<rect x="0" y="${ey + 24}" width="160" height="5" fill="${GOLD}" stroke="none"/><rect x="0" y="${ey + 40}" width="160" height="5" fill="${GOLD}" stroke="none"/><rect x="0" y="58" width="160" height="4" fill="${GOLD}" stroke="none" opacity=".7"/>`;
    if (has('spots')) clip += `<circle cx="44" cy="${ey + 20}" r="5" fill="${D(c, 0.15)}" stroke="none"/><circle cx="120" cy="${ey + 6}" r="6" fill="${D(c, 0.15)}" stroke="none"/><circle cx="108" cy="${ey + 34}" r="4" fill="${D(c, 0.15)}" stroke="none"/>`;
    if (has('runes')) clip += `<path d="M48 ${ey + 34}l6-9 6 9M100 ${ey + 30}h12M106 ${ey + 25}v11" stroke="#ffe27a" stroke-width="2.5" fill="none"/>`;
    if (a.robe) {
      const y = ey + 28;
      clip += `<path d="M0 ${y}Q80 ${y + 10} 160 ${y}V170H0Z" fill="url(#${U}r)" stroke-width="3"/><path d="M80 ${y + 18}V160" fill="none" stroke="${D(rc, 0.5)}" stroke-width="2"/>` +
        `<path d="M64 ${y + 3}L80 ${y + 20}L96 ${y + 3}Q80 ${y + 9} 64 ${y + 3}Z" fill="#fbf6ea" stroke-width="2.5"/><path d="M80 ${y + 7}l-4.5 6 4.5 13 4.5-13z" fill="${a.tie || GOLD}" stroke-width="2"/><circle cx="104" cy="${y + 22}" r="5" fill="url(#${U}g)" stroke-width="2"/>`;
    }
    if (has('sash')) clip += `<path d="M28 ${ey + 8}L132 ${ey + 48}L132 ${ey + 62}L28 ${ey + 22}Z" fill="${a.sashc || '#e8574a'}" stroke-width="2.5"/>`;
    if (has('goggles')) clip += `<rect x="0" y="${ey - 3}" width="160" height="7" fill="#3a2a5a" stroke="none"/>`;
    if (a.scarf) {
      const [s1, s2] = a.scarf, y = ey + 24;
      clip += `<rect x="0" y="${y}" width="160" height="12" fill="${s1}" stroke-width="2.5"/>` + [20, 44, 68, 92, 116, 140].map((x) => `<rect x="${x}" y="${y + 1}" width="7" height="10" fill="${s2}" stroke="none"/>`).join('');
      front += `<path d="M94 ${y + 8}l2 28 13-3-3-25z" fill="${s1}" stroke-width="2.5"/><path d="M96 ${y + 18}l11-2M97 ${y + 27}l11-2" stroke="${s2}" stroke-width="3.5"/>`;
    }

    const hlx = 80 - half * 0.48, hly = top + 20;
    const hl = `<ellipse cx="${hlx}" cy="${hly}" rx="11" ry="6.5" transform="rotate(-32 ${hlx} ${hly})" fill="#fff" opacity=".6" stroke="none"/>`;
    if (has('snout')) preface += `<ellipse cx="80" cy="${ey + 20}" rx="28" ry="15" fill="${L(c, 0.3)}"/><ellipse cx="72" cy="${ey + 16}" rx="2.4" ry="3.4" fill="${D(c, 0.5)}" stroke="none"/><ellipse cx="88" cy="${ey + 16}" rx="2.4" ry="3.4" fill="${D(c, 0.5)}" stroke="none"/>`;

    // ---- face ----
    const es = a.es || 1, ex1 = 80 - g, ex2 = 80 + g;
    const eye = (x, y) => {
      switch (a.eyes || 'big') {
        case 'dot': return `<ellipse cx="${x}" cy="${y}" rx="${5.5 * es}" ry="${6.5 * es}" fill="#2a2350" stroke="none"/><circle cx="${x + 1.8}" cy="${y - 2.2}" r="2" fill="#fff" stroke="none"/>`;
        case 'sleepy': return `<path d="M${x - 8} ${y}q8 6 16 0" fill="none" stroke-width="3.5"/>`;
        case 'happy': return `<path d="M${x - 8} ${y + 3}q8-10 16 0" fill="none" stroke-width="3.5"/>`;
        case 'skull': return `<ellipse cx="${x}" cy="${y}" rx="10" ry="11" fill="#2a2350" stroke="none"/><circle cx="${x}" cy="${y + 1}" r="7" fill="${a.iris}" opacity=".3" stroke="none"/><circle cx="${x}" cy="${y + 1}" r="3.6" fill="${a.iris}" stroke="none"/>`;
        case 'glow': return `<ellipse cx="${x}" cy="${y}" rx="9" ry="10" fill="#ffe36e"/><ellipse cx="${x}" cy="${y}" rx="2.6" ry="7" fill="#2a2350" stroke="none"/><circle cx="${x + 3}" cy="${y - 4}" r="2" fill="#fff" stroke="none"/>`;
        default: {
          let s = `<ellipse cx="${x}" cy="${y}" rx="${10 * es}" ry="${12 * es}" fill="url(#${U}i)" stroke-width="3"/>`;
          if (a.eyes === 'sparkle') s += star4(x + 3.5, y - 4.5, 5.5, '#fff') + `<circle cx="${x - 3.5}" cy="${y + 5}" r="1.8" fill="#fff" stroke="none"/>`;
          else s += `<circle cx="${x + 3.4}" cy="${y - 4.6}" r="${4 * es}" fill="#fff" stroke="none"/><circle cx="${x - 3.4}" cy="${y + 4.6}" r="${1.9 * es}" fill="#fff" stroke="none"/>`;
          return s;
        }
      }
    };
    if (a.eyes === 'one') face += `<ellipse cx="80" cy="${ey - 2}" rx="17" ry="18" fill="#fff" stroke-width="3"/><ellipse cx="81" cy="${ey}" rx="10" ry="11" fill="url(#${U}i)" stroke="none"/><circle cx="85" cy="${ey - 5}" r="4" fill="#fff" stroke="none"/><circle cx="77" cy="${ey + 5}" r="1.8" fill="#fff" stroke="none"/>`;
    else face += eye(ex1, ey) + eye(ex2, ey);
    if (has('marks')) face += mirror(`<path d="M${80 - g - 15} ${ey + 12}h9M${80 - g - 16} ${ey + 18}h9" stroke="#e0563a" stroke-width="2.6" fill="none"/>`);
    else if (a.eyes !== 'skull') face += mirror(`<ellipse cx="${80 - g * 1.5}" cy="${ey + 12}" rx="7.5" ry="4.5" fill="#ff6f9a" opacity=".45" stroke="none"/>`);
    const my = a.my || (a.ey ? sh.ey : ey + 17);
    const MOUTH = {
      smile: `<path d="M73 ${my}q7 6 14 0" fill="none" stroke-width="3"/>`,
      w: `<path d="M71 ${my - 1}q4.5 5 9 0q4.5 5 9 0" fill="none" stroke-width="3"/>`,
      open: `<path d="M72 ${my - 2}q8 14 16 0z" fill="#8a2a4a" stroke-width="3"/><path d="M76 ${my + 4}q4-3 8 0q-4 4-8 0z" fill="#ff8fa8" stroke="none"/>`,
      fang: `<path d="M72 ${my}q8 6 16 0" fill="none" stroke-width="3"/><path d="M75 ${my + 1.5}l2.5 5 2.5-4z" fill="#fff" stroke-width="1.8"/>`,
      o: `<ellipse cx="80" cy="${my + 1}" rx="4" ry="5" fill="#8a2a4a" stroke-width="2.5"/>`,
      beak: `<path d="M72 ${my - 6}L88 ${my - 6}L80 ${my + 5}Z" fill="#ffb03a" stroke-width="3"/>`,
      chomp: `<path d="M50 ${my - 4}Q80 ${my + 30} 110 ${my - 4}Z" fill="#5a1430" stroke-width="3"/><path d="M58 ${my - 3}l5 8 5-8zM72 ${my - 1}l5 8 5-8zM86 ${my - 1}l5 8 5-8zM98 ${my - 3}l5 8 5-8z" fill="#fff" stroke-width="1.8"/><path d="M68 ${my + 11}q12 7 24 0" fill="#ff7fa0" stroke="none"/>`,
      teeth: `<rect x="70" y="${my - 3}" width="20" height="9" rx="3" fill="#fff" stroke-width="2.5"/><path d="M76.5 ${my - 3}v9M83.5 ${my - 3}v9" stroke-width="2"/>`,
      jack: `<path d="M66 ${my - 4}L72 ${my + 2}L78 ${my - 3}L84 ${my + 2}L90 ${my - 3}L95 ${my - 4}Q80 ${my + 14} 66 ${my - 4}Z" fill="#5a2a10" stroke-width="2.5"/>`,
    };
    face += MOUTH[a.mouth || 'smile'];

    // ---- in front of the face ----
    if (has('goggles')) front += `<circle cx="${ex1}" cy="${ey}" r="14" fill="#cff3ff" fill-opacity=".35" stroke-width="4"/><circle cx="${ex2}" cy="${ey}" r="14" fill="#cff3ff" fill-opacity=".35" stroke-width="4"/>`;
    if (has('glasses')) front += `<circle cx="${ex1}" cy="${ey}" r="13" fill="#fff" fill-opacity=".2" stroke="#b8862a" stroke-width="3"/><circle cx="${ex2}" cy="${ey}" r="13" fill="#fff" fill-opacity=".2" stroke="#b8862a" stroke-width="3"/><path d="M${ex1 + 13} ${ey}Q80 ${ey - 5} ${ex2 - 13} ${ey}" fill="none" stroke="#b8862a" stroke-width="3"/>`;
    if (has('beard')) front += `<path d="M64 ${my + 4}Q66 ${my + 30} 80 ${my + 38}Q94 ${my + 30} 96 ${my + 4}Q80 ${my + 12} 64 ${my + 4}Z" fill="#fbf8f2"/>`;
    if (has('shout')) front += `<path d="M44 ${my + 2}l-12 3M42 ${my + 10}l-12 8M116 ${my + 2}l12 3M118 ${my + 10}l12 8" fill="none" stroke-width="3"/>`;
    if (a.front === 'backpack') {
      const bp = a.bp || '#e8574a';
      front += `<g transform="translate(80 ${ey + 34})"><rect x="-32" y="-16" width="64" height="54" rx="15" fill="${bp}"/><path d="M-32 0Q0 12 32 0V-4Q32 -16 18 -16H-18Q-32 -16 -32 -4Z" fill="${D(bp, 0.18)}"/><rect x="-7" y="-3" width="14" height="11" rx="2" fill="url(#${U}g)" stroke-width="2.5"/><rect x="-21" y="16" width="42" height="17" rx="6" fill="${D(bp, 0.18)}"/><path d="M-14 22h20" stroke="#fbf6ea" stroke-width="3"/></g>`;
    }
    const hatCol = `url(#${U}h)`;
    const HATS = {
      wizard: `<ellipse cx="80" cy="50" rx="42" ry="9.5" fill="${hatCol}"/><path d="M54 50Q66 16 100 -6Q94 24 106 50Z" fill="${hatCol}"/><path d="M57 41Q80 48 103 41L105 49Q80 57 55 49Z" fill="url(#${U}g)" stroke-width="2.5"/><path d="${star5(84, 26, 6.5, 3)}" fill="#ffe27a" stroke-width="1.6"/>`,
      grad: `<path d="M58 52Q58 38 80 38Q102 38 102 52Z" fill="#2b2550"/><path d="M42 38L80 24L118 38L80 52Z" fill="#3a3270"/><path d="M80 38L108 46V62" fill="none" stroke="${GOLD}" stroke-width="2.5"/><circle cx="108" cy="64" r="4.5" fill="${GOLD}" stroke-width="2"/>`,
      crown: `<path d="M60 50L58 24L70 38L80 18L90 38L102 24L100 50Z" fill="url(#${U}g)"/><circle cx="80" cy="40" r="3.5" fill="#e8574a" stroke-width="1.6"/><circle cx="68" cy="44" r="2.6" fill="#5b8cff" stroke-width="1.4"/><circle cx="92" cy="44" r="2.6" fill="#5b8cff" stroke-width="1.4"/>`,
      cap: `<path d="M50 54Q50 26 80 26Q110 26 110 54Z" fill="${hatCol}"/><path d="M46 54Q80 46 114 54Q116 62 104 62Q80 56 56 62Q44 62 46 54Z" fill="${D(hcol, 0.35)}"/><circle cx="80" cy="40" r="5.5" fill="url(#${U}g)" stroke-width="2"/>`,
      nightcap: `<path d="M50 56Q54 18 88 16Q114 20 128 50Q114 36 106 42Q110 50 110 56Z" fill="${hatCol}"/><path d="M48 50Q80 58 112 50V60Q80 68 48 60Z" fill="#fbf6ea"/><circle cx="129" cy="54" r="8" fill="#fbf6ea"/>${star4(76, 32, 5)}`,
      beret: `<ellipse cx="76" cy="46" rx="36" ry="12" transform="rotate(-10 76 46)" fill="${hatCol}"/><path d="M74 34l2-7" fill="none"/>`,
      mushroom: `<path d="M24 64Q24 14 80 12Q136 14 136 64Q80 52 24 64Z" fill="url(#${U}m)"/><circle cx="56" cy="36" r="8" fill="#fff" stroke="none"/><circle cx="92" cy="26" r="7" fill="#fff" stroke="none"/><circle cx="114" cy="48" r="5.5" fill="#fff" stroke="none"/><circle cx="76" cy="50" r="4.5" fill="#fff" stroke="none"/><circle cx="38" cy="54" r="4" fill="#fff" stroke="none"/>`,
      bookstack: `<rect x="52" y="36" width="56" height="13" rx="3" fill="#c9413a"/><rect x="56" y="23" width="48" height="13" rx="3" fill="#3a6fb5" transform="rotate(-5 80 30)"/><rect x="60" y="10" width="42" height="13" rx="3" fill="#e0a12e" transform="rotate(4 80 16)"/><path d="M56 42h48" stroke="#fbf6ea" stroke-width="2"/>`,
      nurse: `<path d="M54 52Q54 30 80 30Q106 30 106 52Q80 46 54 52Z" fill="#fbfbff"/><path d="M77 34h6v5h5v6h-5v5h-6v-5h-5v-6h5z" fill="#e8574a" stroke="none"/>`,
      bow: `<path d="M100 44L118 32L118 58Z" fill="${a.bwc || '#ff7fb0'}"/><path d="M100 44L84 34L86 56Z" fill="${a.bwc || '#ff7fb0'}"/><circle cx="100" cy="45" r="5" fill="${D(a.bwc || '#ff7fb0', 0.15)}"/>`,
    };
    if (a.ears && FRONT_EARS[a.ears]) top2 += `<g transform="${earT}">${FRONT_EARS[a.ears]}</g>`;
    if (a.hat && HATS[a.hat]) top2 += `<g transform="${hatT}">${HATS[a.hat]}</g>`;
    if (has('zzz')) top2 += `<path d="M120 30h11l-11 11h11M136 12h8l-8 8h8" fill="none" stroke="#fff" stroke-width="3"/>`;

    const PROPS = {
      wand: `<path d="M0 8L14 -34" fill="none" stroke-width="8"/><path d="M0 8L14 -34" fill="none" stroke="#8a5a32" stroke-width="4"/><circle cx="16" cy="-40" r="12" fill="#ffe27a" opacity=".35" stroke="none"/>${star4(16, -40, 10, '#fff6b8')}`,
      staff: `<path d="M2 34L8 -62" fill="none" stroke-width="9"/><path d="M2 34L8 -62" fill="none" stroke="#8a5a32" stroke-width="4.5"/><circle cx="9" cy="-70" r="18" fill="${a.oc || '#8be9ff'}" opacity=".3" stroke="none"/><circle cx="9" cy="-70" r="11" fill="url(#${U}o)"/>`,
      book: `<g transform="rotate(12)"><rect x="-13" y="-19" width="28" height="34" rx="3" fill="${a.bc || '#c9413a'}"/><path d="M15 -17v30" stroke="#f4e9d2" stroke-width="3"/><rect x="-9" y="-19" width="4" height="34" fill="${D(a.bc || '#c9413a', 0.3)}" stroke="none"/><path d="${star5(3, -2, 7, 3)}" fill="${GOLD}" stroke="none"/></g>`,
      potion: `<rect x="-4" y="-26" width="11" height="13" rx="2" fill="#e6f6ff"/><rect x="-6.5" y="-31" width="16" height="7" rx="2" fill="#b98a5a"/><circle cx="1.5" cy="-2" r="14" fill="${a.pc || '#ff7fb8'}"/><path d="M-10 -6q11.5-6 23 0" stroke="#fff" stroke-width="2" fill="none" opacity=".8"/><circle cx="-4" cy="2" r="2.8" fill="#fff" stroke="none"/><circle cx="10" cy="-40" r="3.5" fill="${L(a.pc || '#ff7fb8', 0.4)}" stroke-width="2"/><circle cx="16" cy="-50" r="2.4" fill="${L(a.pc || '#ff7fb8', 0.4)}" stroke-width="2"/>`,
      broom: `<path d="M-44 40L24 -42" fill="none" stroke-width="8"/><path d="M-44 40L24 -42" fill="none" stroke="#a0703f" stroke-width="4"/><path d="M-40 34L-62 40L-68 62L-54 54L-50 68L-40 50L-34 58Z" fill="#e8bb62"/>`,
      candle: `<circle cx="0" cy="-40" r="16" fill="#ffd36e" opacity=".3" stroke="none"/><rect x="-7" y="-28" width="14" height="32" rx="3" fill="#fff4dc"/><path d="M0 -28v-4" stroke-width="2"/><path d="M0 -48Q8 -38 0 -32Q-8 -38 0 -48Z" fill="url(#${U}f)" stroke-width="2.5"/>`,
      scroll: `<rect x="-9" y="-20" width="22" height="32" fill="#f4e9d2"/><rect x="-12" y="-25" width="28" height="8" rx="4" fill="#d9c08f"/><rect x="-12" y="9" width="28" height="8" rx="4" fill="#d9c08f"/><path d="M-4 -10h12M-4 -4h12M-4 2h8" stroke="#8fb8ff" stroke-width="2"/>`,
      fork: `<rect x="-3.5" y="-30" width="8" height="62" rx="4" fill="#b98a5a"/><path d="M-10 -62h4v15h3v-15h5v15h3v-15h4v19q0 11-10 11q-10 0-10-11z" fill="#e6ebf2"/>`,
      slingshot: `<path d="M0 26V4M0 4L-9 -12M0 4L9 -12" fill="none" stroke-width="10"/><path d="M0 26V4M0 4L-9 -12M0 4L9 -12" fill="none" stroke="#b98a5a" stroke-width="5"/><path d="M-9 -12Q0 0 9 -12" stroke="#ff8fb1" stroke-width="2.5" fill="none"/><circle cx="0" cy="-20" r="5" fill="#ffd34d" stroke-width="2"/>`,
      ruler: `<g transform="rotate(14)"><rect x="-6" y="-48" width="12" height="70" rx="2" fill="#ffd966"/><path d="M-6 -38h5M-6 -28h7M-6 -18h5M-6 -8h7M-6 2h5M-6 12h7" stroke-width="1.6"/></g>`,
      whistle: `<path d="M-2 4Q-14 -8 -10 -24" fill="none" stroke="#e8574a" stroke-width="2"/><path d="M-12 -2h16a7 7 0 0 1 0 14h-16z" fill="url(#${U}g)" stroke-width="2.5"/><circle cx="6" cy="5" r="2.5" fill="#2a2350" stroke="none"/>`,
      heart: `<path d="M10 -18C-2 -26 -8 -34 -2 -40C2 -44 8 -42 10 -38C12 -42 18 -44 22 -40C28 -34 22 -26 10 -18Z" fill="#ff6f9a" stroke-width="2.5"/>${star4(-8, -48, 5)}`,
      gavel: `<path d="M0 20L10 -24" fill="none" stroke-width="8"/><path d="M0 20L10 -24" fill="none" stroke="#8a5a32" stroke-width="4"/><rect x="-6" y="-42" width="34" height="16" rx="4" fill="#a0703f" transform="rotate(14 11 -34)"/>`,
      sword: `<path d="M2 -6L10 -52L16 -48L8 -4Z" fill="#c9a06a"/><path d="M0 22L4 -2" fill="none" stroke-width="8"/><path d="M0 22L4 -2" fill="none" stroke="#8a5a32" stroke-width="4"/><rect x="-10" y="-6" width="26" height="7" rx="3" fill="url(#${U}g)" transform="rotate(10 3 -2)"/>`,
      orb: `<circle cx="12" cy="-28" r="18" fill="#7fd9ff" opacity=".3" stroke="none"/><path d="M12 -48Q26 -30 12 -14Q-2 -30 12 -48Z" fill="#8be9ff"/><path d="M12 -38Q18 -28 12 -20Q6 -28 12 -38Z" fill="#fff" stroke="none"/>`,
      envelope: `<rect x="-15" y="-12" width="30" height="22" rx="3" fill="#fff8e8"/><path d="M-15 -12L0 1L15 -12" fill="none" stroke-width="2.5"/><circle cx="0" cy="3" r="4.5" fill="#e8574a" stroke-width="2"/>`,
    };
    const prop = a.prop && PROPS[a.prop] ? `<g transform="translate(${hx} ${hy})">${PROPS[a.prop]}</g>` : '';
    const hands = `<ellipse cx="${lx}" cy="${hy}" rx="8.5" ry="7.5" fill="${B}"/><ellipse cx="${hx}" cy="${hy}" rx="8.5" ry="7.5" fill="${B}"/>`;
    const fx = has('sparkles') ? star4(26, 52, 7) + star4(138, 66, 5) + star4(142, 124, 6) + star4(20, 120, 4) : '';

    const S = `stroke="${out}" stroke-width="3.6" stroke-linejoin="round" stroke-linecap="round"`;
    const p = pose || {};
    const sc = a.scale || 1;
    const tf = `translate(80 140) rotate(${p.rot || 0}) scale(${sc * (p.sx || 1)} ${sc * (p.sy || 1)}) translate(-80 ${-140 + (p.dy || 0)})`;
    const body =
      `<ellipse cx="80" cy="148" rx="${half * 0.95 * sc}" ry="8" fill="#1a1030" opacity=".25"/>` +
      `<g transform="${tf}"><g ${S}>${back}${feet}<path d="${sh.d}" fill="${B}"/><g clip-path="url(#${U}c)">${clip}</g><path d="${sh.d}" fill="none"/>${hl}${preface}${face}${front}${top2}${prop}${hands}${fx}</g></g>`;
    return { defs, body, vb: CHAR_VB };
  }

  // ======================================================================
  // SPELLS
  // ======================================================================
  function spellArt(spec, team = 0) {
    const a = resolve(spec, team);
    const U = uid('s'), c = a.c, out = D(c, 0.62);
    let defs = ballGrad(U + 'm', c, 1.1) + flameGrad(U + 'f') + goldGrad(U + 'g') +
      `<linearGradient id="${U}y" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fffbd0"/><stop offset=".6" stop-color="#ffd34d"/><stop offset="1" stop-color="#ff9f1c"/></linearGradient>`;
    const M = `url(#${U}m)`;
    const ring = `<g opacity=".9"><circle cx="80" cy="82" r="66" fill="none" stroke="${L(c, 0.35)}" stroke-width="2" stroke-dasharray="1 7"/><circle cx="80" cy="82" r="58" fill="none" stroke="${L(c, 0.25)}" stroke-width="1.5" opacity=".6"/>` +
      [0, 60, 120, 180, 240, 300].map((d) => `<g transform="rotate(${d} 80 82)">${star4(80, 18, 4.5, L(c, 0.55))}</g>`).join('') + `</g>`;
    let m = '';
    const flame = (tf, faceStyle) => `<g transform="${tf}"><path d="M80 26Q116 58 116 96Q116 134 80 136Q44 134 44 96Q46 72 64 58Q62 80 76 82Q70 54 80 26Z" fill="url(#${U}f)"/><path d="M80 66Q98 84 98 104Q98 124 80 124Q62 124 62 104Q64 90 74 84Q74 96 80 96Q76 80 80 66Z" fill="#fff3c4" stroke="none" opacity=".75"/>${cuteFace(80, 104, 0.9, faceStyle)}</g>`;
    switch (a.spell) {
      case 'dragon': {
        const ch = charArt({ shape: 'mochi', c: '#ff9a3c', ears: 'horns', hat: 'grad', eyes: 'happy', mouth: 'open', extra: ['glasses', 'beard', 'spots'], iris: '#8a5a2a' }, team);
        defs += ch.defs;
        m = `<g transform="translate(-14 40) scale(.66)">${ch.body}</g>` + flame('translate(66 -6) scale(.8)', 'dot') + star4(132, 30, 6) + star4(146, 70, 4) + `<path d="M100 40l8-10M112 50l12-6M96 30l2-12" fill="none" stroke-width="3"/>`;
        break;
      }
      case 'fire': m = flame('translate(0 0)', 'dot'); break;
      case 'ice':
        m = [0, 60, 120, 180, 240, 300].map((d) => `<g transform="rotate(${d} 80 82)"><path d="M80 82V22M80 38l-11-9M80 38l11-9M80 56l-9-7M80 56l9-7" fill="none" stroke-width="11"/><path d="M80 82V22M80 38l-11-9M80 38l11-9M80 56l-9-7M80 56l9-7" fill="none" stroke="${L(c, 0.5)}" stroke-width="5.5"/></g>`).join('') +
          `<circle cx="80" cy="82" r="25" fill="${M}"/>` + cuteFace(80, 80, 1);
        break;
      case 'bolt':
        m = `<path d="M98 12L46 90H76L60 152L122 64H90Z" fill="url(#${U}y)"/>` + cuteFace(84, 84, 0.85) + star4(36, 40, 7) + star4(128, 120, 6) + star4(30, 120, 4);
        break;
      case 'heart':
        m = `<path d="M80 136C38 106 22 84 22 62C22 42 38 30 56 30C68 30 76 38 80 46C84 38 92 30 104 30C122 30 138 42 138 62C138 84 122 106 80 136Z" fill="${M}"/>` + cuteFace(80, 80, 1.1) +
          `<path d="M28 30C22 26 20 22 23 19C25 17 28 18 28 20C29 18 32 17 34 19C36 22 34 26 28 30Z" fill="${L(c, 0.3)}" stroke-width="2"/><path d="M136 120C130 116 128 112 131 109C133 107 136 108 136 110C137 108 140 107 142 109C144 112 142 116 136 120Z" fill="${L(c, 0.3)}" stroke-width="2"/>` + star4(140, 30, 6);
        break;
      case 'stars':
        m = `<path d="M10 14L52 56M28 4L60 36M120 130L148 150" stroke="${L(c, 0.5)}" stroke-width="4" opacity=".6" fill="none"/><path d="${star5(58, 58, 10, 4.5)}" fill="#ffe27a"/><path d="${star5(146, 146, 7, 3)}" fill="#ffe27a"/>` +
          `<path d="${star5(86, 88, 50, 24)}" fill="${M}"/>` + cuteFace(86, 90, 0.95);
        break;
      case 'poison':
        m = `<ellipse cx="80" cy="140" rx="60" ry="10" fill="${D(c, 0.1)}" opacity=".7"/><path d="M40 112Q28 80 54 72Q58 44 86 50Q110 40 120 68Q140 76 128 104Q130 128 100 126Q80 138 60 126Q36 128 40 112Z" fill="${M}"/>` +
          cuteFace(84, 90, 1, 'happy') + `<circle cx="40" cy="44" r="7" fill="${L(c, 0.35)}"/><circle cx="128" cy="40" r="5" fill="${L(c, 0.35)}"/><circle cx="140" cy="62" r="3.5" fill="${L(c, 0.35)}"/>`;
        break;
      case 'swirl':
        m = [[80, 40, 50, 13], [84, 62, 40, 11], [78, 82, 31, 10], [83, 100, 23, 8], [80, 116, 15, 7], [82, 130, 8, 5]].map(([x, y, rx, ry]) => `<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" fill="${M}"/>`).join('') +
          cuteFace(84, 62, 0.75) + `<rect x="22" y="70" width="18" height="22" rx="2" fill="#fff" transform="rotate(-20 31 81)"/><rect x="122" y="88" width="16" height="20" rx="2" fill="#fff" transform="rotate(18 130 98)"/><path d="M27 78h9M27 83h9" stroke="#8fb8ff" stroke-width="1.6" transform="rotate(-20 31 81)"/>`;
        break;
      case 'hourglass':
        m = `<path d="M44 30V134M116 30V134" stroke-width="6" fill="none"/><path d="M48 30Q48 64 76 82Q48 100 48 134H112Q112 100 84 82Q112 64 112 30Z" fill="#eaf6ff" fill-opacity=".85"/><path d="M56 40Q58 62 80 76Q102 62 104 40Z" fill="url(#${U}g)" stroke="none"/><path d="M80 78V118" stroke="${GOLD}" stroke-width="3"/><path d="M54 132Q80 102 106 132Z" fill="url(#${U}g)" stroke="none"/><rect x="34" y="16" width="92" height="14" rx="6" fill="#a0703f"/><rect x="34" y="134" width="92" height="14" rx="6" fill="#a0703f"/>` + cuteFace(80, 52, 0.75);
        break;
      case 'frog':
        m = mirror(`<circle cx="56" cy="62" r="18" fill="${M}"/>`) + `<ellipse cx="80" cy="98" rx="54" ry="38" fill="${M}"/>` +
          mirror(`<circle cx="56" cy="62" r="9" fill="#fff"/><circle cx="58" cy="63" r="5" fill="#2a2350" stroke="none"/><circle cx="60" cy="61" r="1.8" fill="#fff" stroke="none"/>`) +
          `<path d="M54 104Q80 124 106 104" fill="none" stroke-width="3.5"/><ellipse cx="50" cy="96" rx="8" ry="4.5" fill="#ff6f9a" opacity=".45" stroke="none"/><ellipse cx="110" cy="96" rx="8" ry="4.5" fill="#ff6f9a" opacity=".45" stroke="none"/>` +
          `<path d="M66 50L64 30L73 40L80 26L87 40L96 30L94 50Z" fill="url(#${U}g)"/>` + star4(26, 40, 7, '#fff6b8') + star4(138, 44, 5, '#fff6b8') + star4(140, 130, 6, '#fff6b8');
        break;
      case 'quill': {
        const q = (x, y, r, s = 1, f = '') => `<g transform="translate(${x} ${y}) rotate(${r}) scale(${s})"><path d="M0 0Q20 -36 4 -76Q-16 -38 0 0Z" fill="${L(c, 0.35)}"/><path d="M0 0L3 -62" fill="none" stroke-width="2"/><path d="M0 0l-3 13 3 4 3-4z" fill="#2a2350"/>${f}</g>`;
        m = q(44, 112, -24, 0.8) + q(122, 120, -18, 0.8) + q(84, 118, -12, 1.1, cuteFace(3, -40, 0.55)) + `<path d="M40 140q3 6 0 9q-3-3 0-9zM124 148q3 6 0 9q-3-3 0-9z" fill="#2a2350" stroke="none"/>`;
        break;
      }
    }
    const S = `stroke="${out}" stroke-width="3.6" stroke-linejoin="round" stroke-linecap="round"`;
    return { defs, body: ring + `<g ${S}>${m}</g>`, vb: '0 0 160 160' };
  }

  // ======================================================================
  // BUILDINGS
  // ======================================================================
  function bldArt(spec, team = 0) {
    const a = resolve(spec, team);
    const U = uid('b'), c = a.c, out = D(c, 0.65);
    const defs = ballGrad(U + 'm', c) + goldGrad(U + 'g') + flameGrad(U + 'f') +
      `<linearGradient id="${U}s" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ece6f4"/><stop offset="1" stop-color="#a99fc0"/></linearGradient>` +
      `<linearGradient id="${U}w" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#c99a66"/><stop offset="1" stop-color="#8c6239"/></linearGradient>` +
      `<linearGradient id="${U}p" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5a5470"/><stop offset="1" stop-color="#1e1a33"/></linearGradient>`;
    const M = `url(#${U}m)`, G = `url(#${U}g)`, W = `url(#${U}w)`;
    const flag = a.flag || TEAM[team].main;
    let m = `<ellipse cx="80" cy="146" rx="58" ry="9" fill="#1a1030" opacity=".25" stroke="none"/>`;
    switch (a.bld) {
      case 'catapult':
        m += `<path d="M58 116L80 72L102 116" fill="none" stroke-width="12"/><path d="M58 116L80 72L102 116" fill="none" stroke="#b98a5a" stroke-width="6"/>` +
          `<path d="M34 120L116 42" fill="none" stroke-width="12"/><path d="M34 120L116 42" fill="none" stroke="#c99a66" stroke-width="6"/>` +
          `<ellipse cx="122" cy="36" rx="20" ry="11" fill="#dfe5ee" transform="rotate(-40 122 36)"/>` +
          `<path d="M107 30l5-24h22l5 24z" fill="#ffd966"/><path d="M112 6h22l1.6 6q-12.6 4-25.2 0z" fill="#a0522d" stroke="none"/>` + cuteFace(123, 18, 0.5) +
          `<circle cx="80" cy="76" r="6" fill="${G}" stroke-width="3"/><rect x="18" y="114" width="124" height="18" rx="6" fill="${W}"/>` +
          `<path d="M30 114V90" fill="none" stroke-width="3"/><path d="M30 90h20l-6 7 6 7H30z" fill="${flag}" stroke-width="2.5"/>` +
          `<circle cx="40" cy="136" r="13" fill="#8c6239"/><circle cx="120" cy="136" r="13" fill="#8c6239"/><circle cx="40" cy="136" r="4" fill="${G}" stroke-width="2"/><circle cx="120" cy="136" r="4" fill="${G}" stroke-width="2"/>`;
        break;
      case 'cauldron':
        m += `<path d="M44 132l-8 12M116 132l8 12" stroke-width="8" fill="none"/><path d="M30 80H130Q134 136 80 140Q26 136 30 80Z" fill="url(#${U}p)"/><ellipse cx="80" cy="80" rx="52" ry="13" fill="#3a3550"/><ellipse cx="80" cy="78" rx="44" ry="8" fill="${M}"/>` +
          `<circle cx="64" cy="66" r="9" fill="${L(c, 0.2)}"/><circle cx="96" cy="58" r="12" fill="${L(c, 0.25)}"/><circle cx="82" cy="40" r="6" fill="${L(c, 0.3)}"/><circle cx="62" cy="34" r="3.5" fill="${L(c, 0.3)}"/>` +
          cuteFace(80, 106, 1.1, 'dot', '#fff3c4') + `<path d="M36 96Q80 106 124 96" fill="none" stroke="${flag}" stroke-width="5"/>`;
        break;
      case 'turret':
        m += `<rect x="50" y="62" width="60" height="80" rx="4" fill="url(#${U}s)"/><path d="M50 82h60M50 102h60M50 122h60M70 62v20M92 82v20M68 102v20M94 122v20" fill="none" stroke="#a79fbc" stroke-width="2"/>` +
          `<path d="M40 68L80 4L120 68Z" fill="${M}"/><path d="M40 68h80" stroke-width="5"/><path d="M80 4V-8" fill="none"/><path d="M80 -8l16 5-16 5z" fill="${flag}"/>` +
          `<path d="M64 112V92a16 16 0 0 1 32 0v20z" fill="#ffd36e"/>` + cuteFace(80, 98, 0.62);
        break;
      case 'candle':
        m += `<path d="M50 142h60l-10-14H60z" fill="${G}"/><path d="M80 128V104" stroke-width="8" fill="none"/><path d="M80 128V104" stroke="${GOLD}" stroke-width="4" fill="none"/><path d="M40 92Q40 112 80 112Q120 112 120 92" fill="none" stroke-width="9"/><path d="M40 92Q40 112 80 112Q120 112 120 92" fill="none" stroke="${GOLD}" stroke-width="4.5"/>` +
          [[40, 66, 26], [120, 66, 26], [80, 40, 62]].map(([x, y, h]) => `<circle cx="${x}" cy="${y - 12}" r="15" fill="#ffd36e" opacity=".3" stroke="none"/><rect x="${x - 9}" y="${y}" width="18" height="${h}" rx="4" fill="#fff4dc"/><path d="M${x} ${y - 22}Q${x + 9} ${y - 10} ${x} ${y - 3}Q${x - 9} ${y - 10} ${x} ${y - 22}Z" fill="url(#${U}f)" stroke-width="2.5"/>`).join('') +
          cuteFace(80, 64, 0.62) + `<path d="M71 98h18" stroke="${flag}" stroke-width="5"/>`;
        break;
      case 'mushroom':
        m += `<path d="M50 140V90Q50 76 80 76Q110 76 110 90V140Z" fill="#fff1dc"/><path d="M70 140V122a10 10 0 0 1 20 0v18z" fill="#a0703f"/>` + cuteFace(80, 100, 0.85) +
          `<path d="M14 88Q14 20 80 18Q146 20 146 88Q80 74 14 88Z" fill="${M}"/><circle cx="50" cy="44" r="10" fill="#fff" stroke="none"/><circle cx="94" cy="34" r="9" fill="#fff" stroke="none"/><circle cx="122" cy="62" r="7" fill="#fff" stroke="none"/><circle cx="76" cy="62" r="6" fill="#fff" stroke="none"/><circle cx="30" cy="74" r="5" fill="#fff" stroke="none"/>` +
          `<path d="M110 120h14v-16" fill="none" stroke-width="3"/><path d="M124 104h14l-5 5 5 5h-14z" fill="${flag}" stroke-width="2.5"/>`;
        break;
      case 'tree':
        m += `<path d="M62 142Q68 110 66 84H94Q92 110 98 142Z" fill="${W}"/><path d="M62 142q-10 0-16 4M98 142q10 0 16 4" fill="none" stroke-width="4"/>` +
          [[48, 70, 30], [112, 70, 30], [80, 48, 36], [80, 82, 30]].map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${M}"/>`).join('') +
          `<path d="M48 70q0 0 0 0" fill="none"/>` + cuteFace(80, 70, 1.1) + `<circle cx="44" cy="54" r="5" fill="#e8574a" stroke-width="2"/><circle cx="118" cy="86" r="5" fill="#e8574a" stroke-width="2"/><path d="M60 118h40" stroke="${flag}" stroke-width="6"/>`;
        break;
      case 'crystal':
        m += `<circle cx="80" cy="82" r="58" fill="${L(c, 0.4)}" opacity=".25" stroke="none"/><path d="M48 62L62 86L56 136H38L32 88Z" fill="${M}"/><path d="M112 62L128 88L122 136H104L98 86Z" fill="${M}"/>` +
          `<path d="M80 12L106 58L94 136H66L54 58Z" fill="${M}"/><path d="M80 12V136M54 58L80 74L106 58" fill="none" stroke="${L(c, 0.5)}" stroke-width="2"/>` +
          `<path d="M28 140Q80 126 132 140V146H28Z" fill="#7a7290"/>` + cuteFace(80, 92, 0.85) + star4(36, 30, 6) + star4(130, 40, 5);
        break;
      case 'mirror':
        m += `<path d="M66 142l14-26 14 26" fill="none" stroke-width="8"/><path d="M66 142l14-26 14 26" fill="none" stroke="#b8862a" stroke-width="4"/>` +
          `<ellipse cx="80" cy="66" rx="42" ry="54" fill="${G}"/><ellipse cx="80" cy="66" rx="32" ry="44" fill="${M}"/><path d="M60 40Q66 30 76 28" fill="none" stroke="#fff" stroke-width="4" opacity=".8"/>` +
          cuteFace(80, 72, 0.95) + `<path d="${star5(80, 10, 9, 4)}" fill="${G}"/>` + star4(66, 100, 4, '#fff') + star4(98, 48, 3.5, '#fff');
        break;
    }
    const S = `stroke="${out}" stroke-width="3.6" stroke-linejoin="round" stroke-linecap="round"`;
    return { defs, body: `<g ${S}>${m}</g>`, vb: '0 -12 160 172' };
  }

  // ======================================================================
  // TOWERS (centred on 0,0 = tower centre on the field)
  // ======================================================================
  function towerArt(type, team = 0) {
    const U = uid('t'), t = TEAM[team];
    const defs = `<linearGradient id="${U}s" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#efe9f7"/><stop offset="1" stop-color="#a69cbf"/></linearGradient>` +
      `<linearGradient id="${U}r" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${L(t.main, 0.25)}"/><stop offset=".55" stop-color="${t.main}"/><stop offset="1" stop-color="${t.dark}"/></linearGradient>` +
      `<radialGradient id="${U}w"><stop offset="0" stop-color="#fff6c8"/><stop offset="1" stop-color="#ffb84a"/></radialGradient>`;
    const ST = `url(#${U}s)`, RF = `url(#${U}r)`, WN = `url(#${U}w)`;
    const crenel = (x, y, w, n) => { let s = `M${x} ${y}`; const step = w / (n * 2 - 1); for (let i = 0; i < n * 2 - 1; i++) s += i % 2 ? `v6h${step}v-6` : `v-7h${step}v7`; return `<path d="${s}" fill="${ST}"/>`; };
    let body;
    if (type === 'main') {
      body = `<ellipse cx="0" cy="44" rx="58" ry="12" fill="#1a1030" opacity=".28" stroke="none"/>` +
        `<rect x="-46" y="-2" width="92" height="46" rx="5" fill="${ST}"/>` + crenel(-46, -2, 92, 7) +
        `<path d="M-46 14h92M-46 30h92M-24 -2v16M10 14v16M-6 30v14M26 30v14" fill="none" stroke="#a79fbc" stroke-width="2"/>` +
        mirror(`<rect x="-54" y="-40" width="20" height="54" rx="3" fill="${ST}"/><path d="M-60 -38L-44 -76L-28 -38Z" fill="${RF}"/><path d="M-48 -18v-8a4 4 0 0 1 8 0v8z" fill="${WN}" stroke-width="2"/>`, 0) +
        `<rect x="-20" y="-54" width="40" height="58" rx="3" fill="${ST}"/><path d="M-28 -52L0 -112L28 -52Z" fill="${RF}"/><path d="M-28 -52h56" stroke-width="5"/>` +
        `<path d="M0 -112v-14" fill="none"/><path d="M0 -126l18 6-18 6z" fill="${t.main}"/>` +
        `<path d="M-9 -16v-14a9 9 0 0 1 18 0v14z" fill="${WN}"/><path d="M-9 -16h18" stroke-width="2"/>` +
        `<path d="M-10 44V30a10 10 0 0 1 20 0v14z" fill="#2a2350"/>` +
        `<path d="M-38 4h18v22l-9-6-9 6z" fill="${t.main}" stroke-width="2.5"/><path d="M20 4h18v22l-9-6-9 6z" fill="${t.main}" stroke-width="2.5"/>` +
        star4(-29, 12, 4, '#fff6c8') + star4(29, 12, 4, '#fff6c8');
      return { defs, body: `<g stroke="${OUT}" stroke-width="3.5" stroke-linejoin="round" stroke-linecap="round">${body}</g>`, vb: '-92 -127 184 184' };
    }
    body = `<ellipse cx="0" cy="34" rx="42" ry="9" fill="#1a1030" opacity=".28" stroke="none"/>` +
      `<rect x="-26" y="-6" width="52" height="40" rx="4" fill="${ST}"/>` + crenel(-26, -6, 52, 4) +
      `<path d="M-26 10h52M-26 24h52M-8 -6v16M10 10v14" fill="none" stroke="#a79fbc" stroke-width="2"/>` +
      `<rect x="-17" y="-30" width="34" height="28" rx="3" fill="${ST}"/><path d="M-24 -28L0 -80L24 -28Z" fill="${RF}"/><path d="M-24 -28h48" stroke-width="4.5"/>` +
      `<path d="M0 -80v-12" fill="none"/><path d="M0 -92l14 5-14 5z" fill="${t.main}"/>` +
      `<circle cx="0" cy="-16" r="13" fill="#ffe08a" opacity=".35" stroke="none"/><path d="M-6 -6v-10a6 6 0 0 1 12 0v10z" fill="${WN}" stroke-width="2.5"/>` +
      `<path d="M-8 34V24a8 8 0 0 1 16 0v10z" fill="#2a2350"/>`;
    return { defs, body: `<g stroke="${OUT}" stroke-width="3.2" stroke-linejoin="round" stroke-linecap="round">${body}</g>`, vb: '-68 -92 136 136' };
  }

  // ======================================================================
  // ARENA background (18x32 tiles @20 = 360x640), point-symmetric, no towers
  // ======================================================================
  function arenaArt() {
    const U = uid('a');
    let seed = 11;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const defs =
      `<pattern id="${U}l" width="40" height="40" patternUnits="userSpaceOnUse"><rect width="40" height="40" fill="#7cc35c"/><rect width="20" height="20" fill="#74b955"/><rect x="20" y="20" width="20" height="20" fill="#74b955"/></pattern>` +
      `<radialGradient id="${U}v" cx=".5" cy=".5" r=".75"><stop offset=".6" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#1b1236" stop-opacity=".35"/></radialGradient>` +
      `<linearGradient id="${U}m" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#3fc9c9"/><stop offset=".5" stop-color="#6a4bd8"/><stop offset="1" stop-color="#3fc9c9"/></linearGradient>` +
      `<linearGradient id="${U}s" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#efe9f7"/><stop offset="1" stop-color="#b3a9c9"/></linearGradient>`;
    // decor drawn in one half, then rotated 180° around the centre
    let half = '';
    for (let i = 0; i < 26; i++) {
      const x = 14 + rnd() * 332, y = 340 + 10 + rnd() * 280;
      if (Math.abs(x - 70) < 22 || Math.abs(x - 290) < 22) continue;
      const col = ['#ffffff', '#ffe27a', '#ffb2cc', '#c9b6ff'][i % 4];
      half += `<g transform="translate(${x.toFixed(1)} ${y.toFixed(1)})"><circle r="2.6" fill="${col}"/><circle r="1" fill="#f2a83a"/></g>`;
    }
    for (let i = 0; i < 18; i++) {
      const x = 10 + rnd() * 340, y = 350 + rnd() * 280;
      half += `<path d="M${x.toFixed(1)} ${y.toFixed(1)}l2-7 2 7M${(x + 4).toFixed(1)} ${y.toFixed(1)}l2-9 2 9" fill="none" stroke="#5e9e45" stroke-width="1.6" stroke-linecap="round"/>`;
    }
    // edge bushes + lamp posts
    half += [[12, 420], [348, 470], [10, 560], [350, 610]].map(([x, y]) => `<g transform="translate(${x} ${y})"><circle cx="-6" r="10" fill="#4f9a3e"/><circle cx="6" r="10" fill="#4f9a3e"/><circle cy="-7" r="11" fill="#5fae4a"/><circle cx="-2" cy="-10" r="4" fill="#8fd174"/></g>`).join('');
    // stone paths (lanes + walk between towers)
    half += `<path d="M70 352V512M290 352V512M70 540Q70 588 130 588H230Q290 588 290 540" fill="none" stroke="#bdb2a0" stroke-width="28" stroke-linecap="round"/>` +
      `<path d="M70 352V512M290 352V512M70 540Q70 588 130 588H230Q290 588 290 540" fill="none" stroke="#e2d9c7" stroke-width="22" stroke-linecap="round" stroke-dasharray="11 3"/>`;
    const rotated = `<g transform="rotate(180 180 320)">${half}</g>`;
    const bridge = (x) => `<g transform="translate(${x} 320)" stroke="#2a2350" stroke-width="2.5"><rect x="-26" y="-38" width="52" height="76" rx="6" fill="url(#${U}s)"/><path d="M-26 -24h52M-26 -10h52M-26 4h52M-26 18h52" stroke="#a79fbc" stroke-width="1.5"/><rect x="-31" y="-38" width="7" height="76" rx="3.5" fill="#cfc5df"/><rect x="24" y="-38" width="7" height="76" rx="3.5" fill="#cfc5df"/>` +
      [[-27.5, -38], [27.5, -38], [-27.5, 38], [27.5, 38]].map(([px, py]) => `<circle cx="${px}" cy="${py}" r="9" fill="#ffd36e" opacity=".35" stroke="none"/><circle cx="${px}" cy="${py}" r="4" fill="#fff1b0"/>`).join('') + `</g>`;
    let moat = `<rect y="292" width="360" height="56" fill="#9a8fb0"/><rect y="296" width="360" height="48" fill="#6f6488"/><rect y="300" width="360" height="40" fill="url(#${U}m)"/>` +
      `<path d="M0 311q15-6 30 0t30 0t30 0t30 0t30 0t30 0t30 0t30 0t30 0t30 0t30 0t30 0" fill="none" stroke="#bff3ff" stroke-opacity=".7" stroke-width="2.5" stroke-linecap="round"/>` +
      `<path d="M-15 329q15-6 30 0t30 0t30 0t30 0t30 0t30 0t30 0t30 0t30 0t30 0t30 0t30 0t30 0" fill="none" stroke="#d6c8ff" stroke-opacity=".6" stroke-width="2" stroke-linecap="round"/>`;
    moat += [[130, 316], [230, 324]].map(([x, y]) => `<g transform="translate(${x} ${y})" stroke="#2a2350" stroke-width="1.6"><path d="M0 0L9 -3A9 7 0 1 1 9 3Z" fill="#7ccf6a"/><circle cx="-2" cy="-1" r="2.6" fill="#ffb2cc" stroke="none"/></g>`).join('');
    moat += [[24, 318], [180, 306], [204, 334], [336, 316], [160, 330]].map(([x, y]) => star4(x, y, 3.5, '#ffffff')).join('');
    const body = `<rect width="360" height="640" fill="url(#${U}l)"/>${half}${rotated}${moat}${bridge(70)}${bridge(290)}<rect width="360" height="640" fill="url(#${U}v)"/>`;
    return { defs, body, vb: '0 0 360 640' };
  }

  // ======================================================================
  // UI pieces
  // ======================================================================
  const RARITY = {
    c: { name: '일반', frame: ['#f0dcb0', '#a8814a', '#ecd29c', '#86663a'], line: '#e2c58c', gem: '#d6b27a' },
    r: { name: '희귀', frame: ['#ffffff', '#93a2bd', '#f1f5fb', '#77849e'], line: '#d4def0', gem: '#7fd0ff' },
    e: { name: '영웅', frame: ['#fff3b8', '#d39a22', '#ffe58a', '#a3700c'], line: '#f6cf5e', gem: '#ffcf4a' },
    l: { name: '전설', frame: ['#ff9ad5', '#ffe08a', '#9affc9', '#9ad0ff', '#c9a0ff'], line: '#ead2ff', gem: '#ff9ad5' },
  };

  /** Card frame 136x175 (game slot size). Art window is transparent unless `art` given. */
  function cardFrameArt(r, art, bgColor) {
    const U = uid('f'), R = RARITY[r];
    const stops = R.frame.map((s, i) => `<stop offset="${(i / (R.frame.length - 1)).toFixed(2)}" stop-color="${s}"/>`).join('');
    const win = 'M12 122V52A56 41 0 0 1 124 52V122Z';
    let defs = `<linearGradient id="${U}f" x1="0" y1="0" x2="1" y2="1">${stops}</linearGradient>` +
      `<linearGradient id="${U}n" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2c2656"/><stop offset="1" stop-color="#16122f"/></linearGradient>` +
      `<linearGradient id="${U}p" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fbf1d8"/><stop offset="1" stop-color="#e2cc9c"/></linearGradient>` +
      `<clipPath id="${U}w"><path d="${win}"/></clipPath>`;
    let inner = '';
    if (art) {
      const bc = bgColor || '#9ad0ff';
      defs += art.defs + `<radialGradient id="${U}b" cx=".5" cy=".4" r=".75"><stop offset="0" stop-color="#fffaf0"/><stop offset=".5" stop-color="${mix(bc, '#fff6e6', 0.62)}"/><stop offset="1" stop-color="${mix(bc, '#2a2350', 0.25)}"/></radialGradient>`;
      inner = `<g clip-path="url(#${U}w)"><rect x="12" y="10" width="112" height="112" fill="url(#${U}b)"/>${star4(28, 40, 3, '#fff')}${star4(110, 30, 2.5, '#fff')}<svg x="14" y="14" width="108" height="108" viewBox="${art.vb}">${art.body}</svg></g>`;
    }
    const dots = Array.from({ length: 22 }, (_, i) => `<circle cx="${(10 + ((i * 37) % 118)).toFixed(0)}" cy="${(130 + ((i * 23) % 40)).toFixed(0)}" r=".9" fill="#fff" opacity=".35"/>`).join('');
    const body =
      `<rect x="1" y="1" width="134" height="173" rx="13" fill="url(#${U}f)" stroke="#2a2350" stroke-width="2"/>` +
      `<rect x="2.5" y="2.5" width="131" height="170" rx="11.5" fill="none" stroke="#fff" stroke-opacity=".55" stroke-width="1"/>` +
      `<path fill-rule="evenodd" d="M10 6H126Q131 6 131 11V164Q131 169 126 169H10Q5 169 5 164V11Q5 6 10 6Z${win}" fill="url(#${U}n)"/>` + dots +
      inner +
      `<path d="${win}" fill="none" stroke="${R.line}" stroke-width="2.5"/>` +
      `<path d="M6 128H130L125 139L130 150H6L11 139Z" fill="url(#${U}p)" stroke="#2a2350" stroke-width="1.8" stroke-linejoin="round"/>` +
      `<path d="M30 160H106" stroke="${R.line}" stroke-width="1.2" opacity=".7"/><path d="M68 156l4 4-4 4-4-4z" fill="${R.gem}"/>` +
      `<g transform="translate(116 18) rotate(45)"><rect x="-6" y="-6" width="12" height="12" fill="${R.gem}" stroke="#2a2350" stroke-width="1.8"/><rect x="-3.5" y="-3.5" width="4" height="4" fill="#fff" opacity=".7"/></g>` +
      `<g transform="translate(2 1) scale(.9)"><path d="M20 3C20 3 5 20 5 30a15 15 0 0 0 30 0C35 20 20 3 20 3z" fill="#7b4be0" stroke="#2a2350" stroke-width="3" stroke-linejoin="round"/><ellipse cx="13.5" cy="27" rx="3" ry="6" fill="#fff" opacity=".45"/></g>`;
    return { defs, body, vb: '0 0 136 175' };
  }

  const BUTTONS = { gold: ['#ffe08a', '#f2b632'], blue: ['#8fb4ff', '#3f74e8'], parchment: ['#fff8e8', '#e6d4ad'], red: ['#ff9a80', '#e8503a'] };
  /** Menu button 540x105, label drawn by the game. */
  function buttonArt(kind, pressed) {
    const U = uid('btn'), [a, b] = BUTTONS[kind];
    const dy = pressed ? 5 : 0;
    const defs = `<linearGradient id="${U}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient>`;
    const body = `<rect x="4" y="12" width="532" height="88" rx="26" fill="#2a2350"/>` +
      `<rect x="4" y="${4 + dy}" width="532" height="88" rx="26" fill="url(#${U})" stroke="#2a2350" stroke-width="5"/>` +
      `<path d="M30 ${16 + dy}H510Q522 ${16 + dy} 522 ${28 + dy}" fill="none" stroke="#fff" stroke-opacity=".6" stroke-width="4" stroke-linecap="round"/>` +
      star4(34, 48 + dy, 6, '#fff') + star4(506, 50 + dy, 5, '#fff');
    return { defs, body, vb: '0 0 540 105' };
  }

  /** Parchment dialog 560x340 with gold frame and wax seal. */
  function panelArt() {
    const U = uid('pn');
    const defs = `<linearGradient id="${U}p" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fbf1d8"/><stop offset="1" stop-color="#e6d1a2"/></linearGradient>` + goldGrad(U + 'g');
    const corner = `<path d="M14 40V20Q14 14 20 14H40" fill="none" stroke="url(#${U}g)" stroke-width="5"/><circle cx="22" cy="22" r="4" fill="url(#${U}g)"/>`;
    const body = `<rect x="6" y="10" width="548" height="324" rx="22" fill="#2a2350" opacity=".35"/><rect x="4" y="4" width="552" height="324" rx="22" fill="url(#${U}p)" stroke="#2a2350" stroke-width="5"/>` +
      `<rect x="16" y="16" width="528" height="300" rx="14" fill="none" stroke="#c9a46a" stroke-width="2" stroke-dasharray="2 5"/>` +
      corner + `<g transform="translate(560 0) scale(-1 1)">${corner}</g><g transform="translate(0 332) scale(1 -1)">${corner}</g><g transform="translate(560 332) scale(-1 -1)">${corner}</g>` +
      `<g transform="translate(280 326)"><circle r="24" fill="#b8324a" stroke="#2a2350" stroke-width="3"/><circle r="16" fill="none" stroke="#e8687a" stroke-width="2"/><path d="${star5(0, 0, 9, 4)}" fill="#e8687a"/></g>`;
    return { defs, body, vb: '0 0 560 352' };
  }

  // ---------- effects ----------
  function explosionFrame(i, n = 6) {
    const U = uid('ex'), t = i / (n - 1);
    const r = 18 + t * 58, op = 1 - t * 0.85;
    const defs = `<radialGradient id="${U}"><stop offset="0" stop-color="#fff8d0"/><stop offset=".45" stop-color="#ffb03a"/><stop offset="1" stop-color="#ff4a3c" stop-opacity="0"/></radialGradient>`;
    let body = `<circle cx="80" cy="80" r="${r}" fill="url(#${U})" opacity="${op}"/>`;
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2 + 0.3, d = 20 + t * 60, x = 80 + Math.cos(a) * d, y = 80 + Math.sin(a) * d;
      body += `<path d="${star5(x, y, 7 * (1 - t * 0.6), 3 * (1 - t * 0.6))}" fill="${k % 2 ? '#ffe27a' : '#fff'}" opacity="${op}"/>`;
    }
    if (t < 0.5) body += `<circle cx="80" cy="80" r="${r * 0.55}" fill="#fff" opacity="${0.8 - t}"/>`;
    body += `<circle cx="80" cy="80" r="${r + 6}" fill="none" stroke="#ffe27a" stroke-width="${4 - t * 3}" opacity="${op}"/>`;
    return { defs, body, vb: '0 0 160 160' };
  }
  function magicCircleFrame(i, n = 4, color = '#f3efe6') {
    const t = (i + 1) / n, C = 2 * Math.PI * 60;
    let body = `<circle cx="80" cy="80" r="60" fill="${color}" fill-opacity=".12"/>` +
      `<circle cx="80" cy="80" r="60" fill="none" stroke="${color}" stroke-width="4" stroke-dasharray="${(C * t).toFixed(1)} ${C}" transform="rotate(-90 80 80)" stroke-linecap="round"/>` +
      `<circle cx="80" cy="80" r="48" fill="none" stroke="${color}" stroke-width="2" stroke-dasharray="3 6" opacity="${t}" transform="rotate(${i * 20} 80 80)"/>`;
    const pts = [];
    for (let k = 0; k < 5; k++) { const a = -Math.PI / 2 + (k * 4 * Math.PI) / 5; pts.push((80 + Math.cos(a) * 46).toFixed(1) + ' ' + (80 + Math.sin(a) * 46).toFixed(1)); }
    body += `<path d="M${pts.join('L')}Z" fill="none" stroke="${color}" stroke-width="2" opacity="${t * 0.8}"/>`;
    for (let k = 0; k < 6; k++) body += `<g transform="rotate(${k * 60 + i * 15} 80 80)">${star4(80, 14, 5 * t, color)}</g>`;
    return { defs: '', body, vb: '0 0 160 160' };
  }
  function projectileArt(kind) {
    const U = uid('pr');
    const defs = flameGrad(U + 'f') + goldGrad(U + 'g');
    const S = 'stroke="#2a2350" stroke-width="2.5" stroke-linejoin="round"';
    const P = {
      star: `<circle cx="16" cy="16" r="12" fill="#ffe27a" opacity=".35"/><path d="${star5(16, 16, 10, 4.5)}" fill="#ffe27a" ${S}/>`,
      potion: `<rect x="13" y="3" width="7" height="7" rx="1" fill="#e6f6ff" ${S}/><circle cx="16.5" cy="18" r="10" fill="#ff7fb8" ${S}/><circle cx="13" cy="15" r="2.2" fill="#fff"/>`,
      pudding: `<path d="M5 26l3-16h17l3 16z" fill="#ffd966" ${S}/><path d="M8 10h17l1 4q-9 3-19 0z" fill="#a0522d"/><circle cx="13" cy="19" r="1.4" fill="#2a2350"/><circle cx="20" cy="19" r="1.4" fill="#2a2350"/>`,
      wisp: `<circle cx="16" cy="16" r="13" fill="#8be9ff" opacity=".3"/><path d="M16 3Q27 14 16 28Q5 14 16 3Z" fill="#8be9ff" ${S}/><path d="M16 11Q20 17 16 23Q12 17 16 11Z" fill="#fff"/>`,
      fireball: `<circle cx="16" cy="16" r="14" fill="#ffb03a" opacity=".3"/><path d="M16 2Q30 12 28 20Q26 30 16 30Q6 30 4 20Q4 12 16 2Z" fill="url(#${U}f)" ${S}/><circle cx="12" cy="19" r="1.6" fill="#2a2350"/><circle cx="20" cy="19" r="1.6" fill="#2a2350"/>`,
    };
    return { defs, body: P[kind], vb: '0 0 32 32' };
  }

  // ---------- menu background 720x1560 ----------
  function menuBgArt() {
    const U = uid('mb');
    let seed = 5;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const defs = `<linearGradient id="${U}s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0d0b24"/><stop offset=".55" stop-color="#2a2160"/><stop offset="1" stop-color="#4a3a8c"/></linearGradient>` +
      `<radialGradient id="${U}m"><stop offset="0" stop-color="#fffbe6"/><stop offset=".6" stop-color="#fff1c0"/><stop offset="1" stop-color="#ffe08a" stop-opacity="0"/></radialGradient>`;
    let stars = '';
    for (let i = 0; i < 90; i++) stars += `<circle cx="${(rnd() * 720).toFixed(0)}" cy="${(rnd() * 900).toFixed(0)}" r="${(0.8 + rnd() * 1.8).toFixed(1)}" fill="#fff" opacity="${(0.35 + rnd() * 0.6).toFixed(2)}"/>`;
    for (let i = 0; i < 8; i++) stars += star4(+(rnd() * 720).toFixed(0), +(rnd() * 700).toFixed(0), 5 + rnd() * 6, '#fff6c8');
    const tw = (x, y, w, h, roofH) => `<rect x="${x}" y="${y}" width="${w}" height="${h}"/><path d="M${x - 8} ${y + 2}L${x + w / 2} ${y - roofH}L${x + w + 8} ${y + 2}Z"/>`;
    const castle = `<g fill="#151132">${tw(120, 900, 70, 400, 110)}${tw(220, 980, 110, 320, 120)}${tw(350, 820, 80, 480, 150)}${tw(450, 960, 120, 340, 120)}${tw(590, 920, 64, 380, 110)}<rect x="90" y="1080" width="560" height="260"/></g>`;
    let windows = '';
    for (let i = 0; i < 26; i++) {
      const x = 130 + rnd() * 500, y = 960 + rnd() * 300;
      windows += `<rect x="${x.toFixed(0)}" y="${y.toFixed(0)}" width="10" height="16" rx="5" fill="#ffd36e" opacity="${(0.6 + rnd() * 0.4).toFixed(2)}"/>`;
    }
    let candles = '';
    for (let i = 0; i < 12; i++) {
      const x = 40 + rnd() * 640, y = 380 + rnd() * 480;
      candles += `<g transform="translate(${x.toFixed(0)} ${y.toFixed(0)})"><circle cy="-10" r="14" fill="#ffd36e" opacity=".22"/><rect x="-4" y="0" width="8" height="22" rx="2" fill="#fff4dc"/><path d="M0 -12Q5 -5 0 -1Q-5 -5 0 -12Z" fill="#ffb03a"/></g>`;
    }
    const body = `<rect width="720" height="1560" fill="url(#${U}s)"/>${stars}<circle cx="560" cy="250" r="140" fill="url(#${U}m)" opacity=".55"/><circle cx="560" cy="250" r="74" fill="#fff8de"/><circle cx="534" cy="232" r="12" fill="#f0e2b6" opacity=".6"/><circle cx="584" cy="276" r="8" fill="#f0e2b6" opacity=".6"/>` +
      candles + castle + windows +
      `<path d="M0 1300Q180 1240 360 1280T720 1260V1560H0Z" fill="#1c3a2c"/><path d="M0 1360Q220 1310 420 1350T720 1340V1560H0Z" fill="#244a36"/>`;
    return { defs, body, vb: '0 0 720 1560' };
  }

  // ---------- app icon ----------
  function iconArt(maskable) {
    const U = uid('ic');
    const ch = charArt(ROSTER_BY_ID.apprenticeCat.art, 0);
    const defs = `<radialGradient id="${U}" cx=".5" cy=".35" r=".8"><stop offset="0" stop-color="#5a45b8"/><stop offset="1" stop-color="#1b1638"/></radialGradient>` + ch.defs;
    const pad = maskable ? 0.18 : 0.06;
    const s = 512 * (1 - pad * 2);
    const body = `<rect width="512" height="512" fill="url(#${U})"/>` + star4(90, 100, 14, '#fff6c8') + star4(420, 80, 10, '#fff6c8') + star4(440, 400, 8, '#fff6c8') +
      `<circle cx="400" cy="130" r="40" fill="#fff8de" opacity=".9"/>` +
      `<svg x="${512 * pad}" y="${512 * pad + 10}" width="${s}" height="${s}" viewBox="${ch.vb}">${ch.body}</svg>`;
    return { defs, body, vb: '0 0 512 512' };
  }

  // ---------- wrapping ----------
  function svg(art, w, h, extraAttr = '') {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${art.vb}" width="${w}" height="${h}" ${extraAttr}><defs>${art.defs}</defs>${art.body}</svg>`;
  }
  function artFor(card, team = 0, pose) {
    if (card.type === 'spell') return spellArt(card.art, team);
    if (card.type === 'building') return bldArt(card.art, team);
    return charArt(card.art, team, pose);
  }

  // ======================================================================
  // ROSTER — 50 cards. type: unit / spell / building. r: c 일반, r 희귀, e 영웅, l 전설
  // t: [체력, 공격, 속도] 1~5 (기획 가이드용; 실제 수치는 cards.json에서 밸런싱)
  // inGame: 지금 게임에 들어 있는 8장 (id 유지)
  // ======================================================================
  const U_ = 'unit', S_ = 'spell', B_ = 'building';
  const ROSTER = [
    { id: 'spearman', inGame: 1, name: '포크창 도깨비', old: '창병', type: U_, cost: 3, r: 'c', n: 1, role: '근접 · 지상', ab: '급식실 포크로 콕콕. 싸고 튼튼한 기본 근접 유닛.', q: '급식 1등은 양보 못 해!', t: [3, 3, 3],
      art: { shape: 'mochi', c: '#7fd8b4', ears: 'horn1', mouth: 'fang', prop: 'fork', robe: 1, iris: '#2f8a6a' } },
    { id: 'crossbow', inGame: 1, name: '새총 쌍둥이', old: '석궁수', type: U_, cost: 3, r: 'c', n: 2, role: '원거리 · 지상/공중', ab: '별사탕을 쏘는 외눈 임프 쌍둥이. 공중도 맞힌다.', q: '둘이 쏘면 혼나는 것도 두 배.', t: [1, 2, 3],
      art: { shape: 'round', c: '#b79cff', eyes: 'one', ears: 'horns', wings: 'bat', tail: 'devil', prop: 'slingshot', iris: '#ff6fa8', scarf: ['T', '#fbf6ea'] } },
    { id: 'shieldGiant', inGame: 1, name: '책가방 골렘', old: '방패 거인', type: U_, cost: 5, r: 'e', n: 1, role: '탱커 · 건물만 공격', ab: '교과서 가득한 가방으로 공격을 막으며 탑으로 직진.', q: '가방에 전 과목 교과서 들었음.', t: [5, 3, 1],
      art: { shape: 'square', c: '#9aa8c7', ears: 'moss', front: 'backpack', bp: 'T', mouth: 'smile', iris: '#e0a12e', scale: 1.04 } },
    { id: 'bats', inGame: 1, name: '시험지 박쥐 떼', old: '박쥐 떼', type: U_, cost: 2, r: 'c', n: 4, role: '근접 · 공중 · 빠름', ab: '빵점 시험지를 접어 만든 박쥐 넷. 빠르고 약하다.', q: '빵점 시험지는 날려 버리면 그만.', t: [1, 1, 5],
      art: { shape: 'round', c: '#fbf8ef', ears: 'cat', wings: 'bat', wc: '#e3dcc6', extra: ['paper'], eyes: 'dot', mouth: 'w', hat: 'bow', bwc: 'T' } },
    { id: 'bombGoblin', inGame: 1, name: '플라스크 슬라임', old: '폭탄 고블린', type: U_, cost: 4, r: 'r', n: 1, role: '원거리 범위 · 지상', ab: '터지는 플라스크를 던져 뭉친 적을 한 번에.', q: '실험은 원래 터지라고 하는 거야.', t: [2, 4, 3],
      art: { shape: 'drop', c: '#a6e35a', extra: ['goggles'], mouth: 'open', prop: 'potion', pc: '#ff7fb8', scarf: ['T', '#fbf6ea'] } },
    { id: 'knights', inGame: 1, name: '해골 선도부', old: '기사단', type: U_, cost: 5, r: 'e', n: 3, role: '근접 · 지상 · 3명', ab: '자를 든 선도부 셋이 줄 맞춰 행진.', q: '복도에서 뛰면 벌점!', t: [3, 3, 3],
      art: { shape: 'mochi', c: '#f7f2e4', eyes: 'skull', iris: '#7fd9ff', mouth: 'teeth', hat: 'cap', hc: 'T', prop: 'ruler', robe: 1 } },
    { id: 'fireball', inGame: 1, name: '용 선생 재채기', old: '불덩이', type: S_, cost: 4, r: 'l', role: '주문 · 범위 피해', ab: '담임 용 선생님의 재채기 한 방. 범위 안 모두에게 큰 피해.', q: '에… 에… 에취!', t: [0, 5, 0],
      art: { spell: 'dragon', c: '#ff7a3c' } },
    { id: 'catapult', inGame: 1, name: '급식 투석기', old: '투석 포대', type: B_, cost: 4, r: 'r', role: '건물 · 원거리 · 30초', ab: '살아 있는 푸딩을 멀리 날려 보낸다.', q: '오늘의 메뉴: 날아오는 푸딩.', t: [3, 3, 1],
      art: { bld: 'catapult', c: '#e0a85a', flag: 'T' } },

    { id: 'apprenticeCat', name: '견습 마법사 냥냥', type: U_, cost: 3, r: 'c', n: 1, role: '원거리 마법 · 지상/공중', ab: '지팡이로 별빛 탄을 쏘는 1학년 마법사.', q: '주문 외우다 혀 깨물었어냥.', t: [2, 3, 3],
      art: { shape: 'mochi', c: '#ffb35c', ears: 'cat', hat: 'wizard', hc: '#3b3f8f', mouth: 'w', prop: 'wand', robe: 1, iris: '#3a8a4a' } },
    { id: 'broomOwl', name: '빗자루 부엉이', type: U_, cost: 4, r: 'r', n: 1, role: '근접 · 공중 · 빠름', ab: '빗자루를 타고 급강하해 뒤쪽을 기습한다.', q: '야간 비행은 내 전공.', t: [2, 3, 5],
      art: { shape: 'round', c: '#b08a62', ears: 'tuft', wings: 'feather', wc: '#8a6a48', mouth: 'beak', es: 1.12, prop: 'broom', scarf: ['#c9413a', '#f2c14e'], iris: '#e0a12e' } },
    { id: 'candleGhost', name: '촛불 유령', type: U_, cost: 2, r: 'c', n: 1, role: '원거리 · 공중', ab: '촛불을 들고 둥실둥실. 싸고 가벼운 견제용.', q: '불 끄면 나 사라져…', t: [1, 2, 3],
      art: { shape: 'ghost', c: '#e9e4ff', eyes: 'dot', mouth: 'o', prop: 'candle', extra: ['sparkles'] } },
    { id: 'mimic', name: '도서관 미믹', type: U_, cost: 4, r: 'r', n: 1, role: '근접 · 지상 · 매복', ab: '책장인 척 숨어 있다가 다가오면 덥석.', q: '연체된 책은 내가 먹는다.', t: [3, 4, 2],
      art: { shape: 'square', c: '#b0623a', mouth: 'chomp', extra: ['bookspine'], iris: '#ffcf4a' } },
    { id: 'mandrake', name: '맨드레이크 꼬마', type: U_, cost: 2, r: 'c', n: 1, role: '근접 · 지상 · 등장 시 기절', ab: '등장하며 비명을 질러 주변 적을 잠깐 멈춘다.', q: '으아아아아앙!', t: [1, 1, 3],
      art: { shape: 'bean', c: '#e8c48e', ears: 'leaf', mouth: 'open', eyes: 'happy', extra: ['shout'] } },
    { id: 'jellyBear', name: '젤리곰 반장', type: U_, cost: 3, r: 'c', n: 1, role: '근접 · 지상 · 튼튼', ab: '말랑말랑해서 맞아도 끄떡없는 반장.', q: '조용! 반장 말 들어!', t: [4, 2, 2],
      art: { shape: 'mochi', c: '#ff8fb1', ears: 'bear', mouth: 'smile', prop: 'whistle', extra: ['sash'], sashc: '#f2c14e' } },
    { id: 'cottonSheep', name: '솜사탕 양', type: U_, cost: 3, r: 'r', n: 1, role: '지원 · 주변 아군 회복', ab: '솜사탕 구름으로 주변 아군을 조금씩 치유.', q: '달콤하면 다 나아.', t: [2, 1, 2],
      art: { shape: 'round', c: '#ffd6ec', ears: 'curl', eyes: 'happy', mouth: 'w', prop: 'heart', extra: ['sparkles'] } },
    { id: 'scrollPenguin', name: '주문서 펭귄', type: U_, cost: 3, r: 'c', n: 1, role: '원거리 · 지상 · 감속', ab: '얼음 주문서를 읽어 적을 느리게 만든다.', q: '두루마리는 아래에서 위로 읽어.', t: [2, 2, 2],
      art: { shape: 'bean', c: '#33407a', belly: '#f5f7ff', bellyBig: 1, mouth: 'beak', prop: 'scroll', hat: 'beret', hc: '#c9413a', iris: '#5b8cff' } },
    { id: 'spiderLibrarian', name: '거미 사서', type: U_, cost: 4, r: 'r', n: 1, role: '원거리 · 지상/공중 · 거미줄', ab: '거미줄로 적을 묶고 두꺼운 책으로 콕.', q: '도서관에서는 조용히.', t: [2, 3, 2],
      art: { shape: 'round', c: '#6b4fc8', extra: ['legs8', 'glasses'], es: 0.9, prop: 'book', bc: '#2f8a6a', iris: '#ff9ad5' } },
    { id: 'starBunny', name: '별똥 토끼', type: U_, cost: 4, r: 'e', n: 1, role: '근접 · 지상 · 순간이동', ab: '별똥별처럼 반짝 순간이동해 뒤를 친다.', q: '소원은 한 번에 하나만!', t: [2, 4, 4],
      art: { shape: 'mochi', c: '#cbb6ff', ears: 'bunny', eyes: 'sparkle', mouth: 'w', prop: 'wand', extra: ['sparkles'], iris: '#ff6fa8' } },
    { id: 'crystalTurtle', name: '수정 거북', type: U_, cost: 5, r: 'r', n: 1, role: '탱커 · 지상 · 느림', ab: '등의 마력 수정이 피해를 흡수한다.', q: '천천히 가도 결국 도착해.', t: [5, 2, 1],
      art: { shape: 'mochi', c: '#6fcf97', extra: ['shell'], eyes: 'sleepy', mouth: 'smile' } },
    { id: 'mushroomTrio', name: '버섯 요정단', type: U_, cost: 3, r: 'c', n: 3, role: '근접 · 지상 · 3명', ab: '빨간 모자를 쓴 버섯 요정 셋.', q: '우린 그늘에서 자랐어.', t: [1, 2, 3],
      art: { shape: 'bean', c: '#fff1dc', hat: 'mushroom', eyes: 'dot', mouth: 'smile', scale: 0.94 } },
    { id: 'hippoPresident', name: '하마 학생회장', type: U_, cost: 6, r: 'e', n: 1, role: '탱커 · 지상 · 돌진', ab: '학생회장 망치를 들고 쿵쿵 돌진.', q: '회의 시작합니다. 땅땅!', t: [5, 4, 1],
      art: { shape: 'mochi', c: '#a99bd6', ears: 'smallears', hat: 'grad', mouth: 'smile', prop: 'gavel', robe: 1, rc: '#7a2a3a', extra: ['snout'], ey: 82, my: 108, scale: 1.04 } },
    { id: 'salamander', name: '불도마뱀 조교', type: U_, cost: 4, r: 'r', n: 1, role: '원거리 범위 · 지상', ab: '작은 불꽃을 뱉어 붙어 있는 적을 태운다.', q: '실습 조교니까 반말 금지.', t: [2, 3, 3],
      art: { shape: 'bean', c: '#ff7a4a', ears: 'flame', mouth: 'fang', extra: ['spots', 'glasses'], tail: 'cattail', iris: '#7a3a10' } },
    { id: 'frostFairy', name: '서리 요정', type: U_, cost: 3, r: 'r', n: 1, role: '원거리 · 공중 · 감속', ab: '눈송이를 뿌려 맞은 적을 느리게.', q: '내 날개, 만지면 녹아.', t: [1, 2, 4],
      art: { shape: 'drop', c: '#a9e4ff', wings: 'fairy', eyes: 'sparkle', mouth: 'smile', prop: 'wand', scale: 0.92, iris: '#4a8fe0' } },
    { id: 'tomeGolem', name: '고서 골렘', type: U_, cost: 7, r: 'l', n: 1, role: '탱커 · 건물만 · 쓰러지면 책 폭발', ab: '천 년 된 책들이 모여 깨어난 거인.', q: '…조용히 해라… 열람실이다…', t: [5, 5, 1],
      art: { shape: 'square', c: '#c8a87a', hat: 'bookstack', eyes: 'glow', mouth: 'smile', extra: ['bookspine', 'runes'], scale: 1.06 } },
    { id: 'sleepyDragon', name: '아기 드래곤 꾸벅', type: U_, cost: 6, r: 'l', n: 1, role: '원거리 범위 · 공중', ab: '졸다가 하품하면 불꽃이 쏟아진다.', q: '5분만… 더…', t: [4, 4, 2],
      art: { shape: 'mochi', c: '#7fd0b8', ears: 'horns', wings: 'dragon', hat: 'nightcap', hc: '#5b8cff', eyes: 'sleepy', mouth: 'smile', extra: ['zzz', 'spots'], belly: '#fff1c4' } },
    { id: 'werewolfCoach', name: '늑대인간 체육쌤', type: U_, cost: 5, r: 'e', n: 1, role: '근접 · 지상 · 체력 낮으면 광폭', ab: '체력이 반 아래로 떨어지면 공격이 빨라진다.', q: '운동장 열 바퀴!', t: [4, 4, 3],
      art: { shape: 'mochi', c: '#9aa0b5', ears: 'wolf', mouth: 'fang', prop: 'whistle', robe: 1, rc: '#c9413a', tie: '#fbf6ea', iris: '#f2c14e' } },
    { id: 'vampirePrefect', name: '뱀파이어 반장', type: U_, cost: 4, r: 'e', n: 1, role: '근접 · 지상 · 흡혈', ab: '때린 만큼 체력을 회복하는 우아한 반장.', q: '토마토 주스 마시는 거야, 진짜로.', t: [3, 3, 3],
      art: { shape: 'mochi', c: '#e9e6f5', ears: 'elf', extra: ['cape'], cc: '#b8324a', mouth: 'fang', iris: '#d6334d', robe: 1, rc: '#2a2350' } },
    { id: 'pumpkinKnight', name: '호박 기사', type: U_, cost: 4, r: 'c', n: 1, role: '근접 · 지상', ab: '단단한 호박 껍질 갑옷의 신입 기사.', q: '속은 텅 비어서 가벼워!', t: [3, 3, 2],
      art: { shape: 'round', c: '#ff9a3c', ears: 'stem', extra: ['ridges'], eyes: 'happy', mouth: 'jack', prop: 'sword' } },
    { id: 'mummyNurse', name: '미라 보건쌤', type: U_, cost: 4, r: 'r', n: 1, role: '원거리 · 지상 · 붕대로 묶기', ab: '붕대를 던져 적을 묶고 아군을 치료.', q: '아프면 보건실로 와.', t: [3, 2, 2],
      art: { shape: 'bean', c: '#efe6cf', extra: ['bandage'], hat: 'nurse', iris: '#2f8a6a' } },
    { id: 'gumiho', name: '구미호 전학생', type: U_, cost: 5, r: 'l', n: 1, role: '원거리 · 지상/공중 · 연쇄', ab: '여우불이 적에서 적으로 튕긴다.', q: '꼬리 개수는 비밀이야.', t: [3, 4, 4],
      art: { shape: 'mochi', c: '#fff1d6', ears: 'fox', tail: 'tail9', eyes: 'sparkle', mouth: 'w', prop: 'orb', extra: ['marks'], iris: '#e0563a' } },
    { id: 'frogPrince', name: '개구리 왕자', type: U_, cost: 2, r: 'c', n: 1, role: '근접 · 지상 · 빠름', ab: '혀로 쭉! 싸고 빠른 견제용 왕자님.', q: '뽀뽀는 사양할게.', t: [1, 2, 4],
      art: { shape: 'mochi', c: '#7ccf6a', ears: 'frog', ey: 54, gap: 22, my: 100, hat: 'crown', hy: -22, mouth: 'smile', scale: 0.92 } },
    { id: 'shadowCat', name: '그림자 고양이', type: U_, cost: 3, r: 'e', n: 1, role: '근접 · 지상 · 은신', ab: '배치 후 3초간 보이지 않는다.', q: '…', t: [2, 4, 4],
      art: { shape: 'mochi', c: '#3b3f6e', ears: 'cat', eyes: 'glow', mouth: 'w', tail: 'cattail', extra: ['sparkles'], scale: 0.94 } },
    { id: 'beeMail', name: '꿀벌 우편대', type: U_, cost: 2, r: 'c', n: 3, role: '근접 · 공중 · 빠름', ab: '편지를 배달하던 꿀벌 셋.', q: '등기는 서명 필수!', t: [1, 1, 5],
      art: { shape: 'round', c: '#ffd34d', ears: 'antenna', c2: '#2a2350', wings: 'fairy', extra: ['stripes'], eyes: 'dot', mouth: 'smile', prop: 'envelope', scale: 0.9 } },
    { id: 'headOwl', name: '부엉 교장', type: U_, cost: 8, r: 'l', n: 1, role: '원거리 마법 · 아군 공격 속도 증가', ab: '주변 아군을 응원해 공격 속도를 올리는 전설의 교장.', q: '오늘도 모두 무사히 귀가하렴.', t: [4, 4, 2],
      art: { shape: 'round', c: '#c8b8a0', ears: 'tuft', wings: 'feather', wc: '#8a7a62', mouth: 'beak', hat: 'wizard', hc: '#5b2a7a', prop: 'staff', oc: '#c9a0ff', extra: ['glasses', 'beard'], scale: 1.04, iris: '#8a5a2a' } },

    { id: 'freeze', name: '꽁꽁 얼음 주문', type: S_, cost: 3, r: 'r', role: '주문 · 범위 빙결 3초', ab: '범위 안의 적을 꽁꽁 얼린다.', q: '얼음땡! 아니, 얼음만!', t: [0, 1, 0], art: { spell: 'ice', c: '#7fd0ff' } },
    { id: 'lightningRoll', name: '번개 출석부', type: S_, cost: 6, r: 'e', role: '주문 · 강한 적 3명 타격', ab: '출석 부르듯 가장 강한 적 셋을 차례로 지진다.', q: '대답 안 하면 결석 처리!', t: [0, 5, 0], art: { spell: 'bolt', c: '#ffd34d' } },
    { id: 'heartRain', name: '하트 비', type: S_, cost: 3, r: 'r', role: '주문 · 범위 아군 회복', ab: '분홍 하트 비가 범위 안 아군을 치유한다.', q: '오늘도 칭찬 스티커!', t: [0, 0, 0], art: { spell: 'heart', c: '#ff8fb1' } },
    { id: 'starShower', name: '별똥별 소나기', type: S_, cost: 5, r: 'e', role: '주문 · 넓은 범위 지속 피해', ab: '별똥별이 4초 동안 쏟아진다.', q: '소원 빌 틈이 없어!', t: [0, 4, 0], art: { spell: 'stars', c: '#c9a0ff' } },
    { id: 'poisonSpill', name: '엎질러진 독약', type: S_, cost: 4, r: 'c', role: '주문 · 범위 지속 피해', ab: '바닥에 고인 독약이 서서히 피해를 준다.', q: '이거 숙제였는데…', t: [0, 3, 0], art: { spell: 'poison', c: '#8be36a' } },
    { id: 'homeworkTornado', name: '숙제 회오리', type: S_, cost: 3, r: 'r', role: '주문 · 적을 한곳으로 모음', ab: '숙제 종이 회오리가 적을 빨아들인다.', q: '숙제가 날아가 버렸어요!', t: [0, 1, 0], art: { spell: 'swirl', c: '#9fd8ff' } },
    { id: 'timeStop', name: '시간 정지 모래시계', type: S_, cost: 5, r: 'l', role: '주문 · 범위 시간 정지 2초', ab: '범위 안 모든 적과 투사체를 멈춘다.', q: '쉿, 종 치기 전까지.', t: [0, 0, 0], art: { spell: 'hourglass', c: '#f2c14e' } },
    { id: 'frogify', name: '개구리 변신술', type: S_, cost: 4, r: 'e', role: '주문 · 적을 4초간 개구리로', ab: '변신한 적은 약하고 느려진다.', q: '개굴! 개굴!', t: [0, 0, 0], art: { spell: 'frog', c: '#7ccf6a' } },
    { id: 'quillRain', name: '깃펜 소나기', type: S_, cost: 3, r: 'c', role: '주문 · 넓은 범위 약한 피해', ab: '깃펜이 비처럼 쏟아져 작은 적을 정리한다.', q: '맞춤법 틀린 녀석부터!', t: [0, 2, 0], art: { spell: 'quill', c: '#7b8cff' } },

    { id: 'bubbleCauldron', name: '보글보글 가마솥', type: B_, cost: 5, r: 'r', role: '건물 · 꼬마 슬라임 생성', ab: '10초마다 꼬마 슬라임을 끓여 낸다.', q: '오늘의 수프: 슬라임.', t: [3, 0, 0], art: { bld: 'cauldron', c: '#7be36a', flag: 'T' } },
    { id: 'spireTower', name: '마법 첨탑', type: B_, cost: 4, r: 'c', role: '건물 · 방어 · 지상/공중', ab: '별빛 탄을 쏘는 기본 방어 탑.', q: '경비는 내가 맡을게.', t: [3, 3, 0], art: { bld: 'turret', c: '#8f7be8', flag: 'T' } },
    { id: 'candleWatch', name: '촛대 감시탑', type: B_, cost: 3, r: 'c', role: '건물 · 방어 · 지상', ab: '세 개의 촛불이 번갈아 불꽃을 쏜다.', q: '촛농 조심!', t: [2, 3, 0], art: { bld: 'candle', c: '#ffcf6e', flag: 'T' } },
    { id: 'mushroomDorm', name: '버섯 기숙사', type: B_, cost: 4, r: 'r', role: '건물 · 버섯 요정 생성', ab: '버섯 요정이 하나씩 등교한다.', q: '지각하면 벌점!', t: [3, 0, 0], art: { bld: 'mushroom', c: '#e8574a', flag: 'T' } },
    { id: 'talkingTree', name: '말하는 나무', type: B_, cost: 5, r: 'e', role: '건물 · 탱커 · 적 유인', ab: '튼튼한 나무가 적의 시선을 끈다.', q: '나한테 낙서하지 마.', t: [5, 0, 0], art: { bld: 'tree', c: '#6fbf5a', flag: 'T' } },
    { id: 'manaCrystal', name: '마력 수정', type: B_, cost: 6, r: 'e', role: '건물 · 잉크 생성', ab: '살아 있는 동안 잉크를 천천히 만든다.', q: '반짝이는 건 다 내 덕분.', t: [3, 0, 0], art: { bld: 'crystal', c: '#b48cff' } },
    { id: 'mirrorMaze', name: '거울 미로', type: B_, cost: 4, r: 'r', role: '건물 · 미끼 · 분신', ab: '공격받으면 가짜 분신을 만든다.', q: '거울아 거울아, 누가 제일 귀엽니?', t: [2, 0, 0], art: { bld: 'mirror', c: '#9fd8ff' } },
  ];
  const ROSTER_BY_ID = Object.fromEntries(ROSTER.map((c) => [c.id, c]));

  /** Sprite sizes requested by the developer (display px; export at 2x). */
  const SPRITE_SIZES = { spearman: 63, bombGoblin: 63, knights: 63, crossbow: 56, bats: 42, shieldGiant: 112, catapult: 108, tower_main: 136, tower_side: 104 };
  const POSES = {
    walk: [{}, { dy: -5, rot: -3, sx: 1.02, sy: 0.97 }],
    attack: [{ rot: -9, sx: 0.97, sy: 1.04 }, { rot: 11, sx: 1.05, sy: 0.95 }],
  };

  const API = { TEAM, RARITY, ROSTER, ROSTER_BY_ID, SPRITE_SIZES, POSES, charArt, spellArt, bldArt, towerArt, arenaArt, cardFrameArt, buttonArt, panelArt, explosionFrame, magicCircleFrame, projectileArt, menuBgArt, iconArt, artFor, svg, mix, L, D };
  if (typeof module === 'object' && module.exports) module.exports = API;
  else root.MC = API;
})(typeof globalThis !== 'undefined' ? globalThis : this);
