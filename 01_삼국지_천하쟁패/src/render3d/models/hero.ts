/**
 * 명장 모형 (임시 코드 모형, 시안 HEROES·riderGeo·weaponGeo·horseGeo).
 * - 시안에 있는 9명은 그대로, 나머지 무장은 2D 초상과 같은 얼굴 데이터(눈·수염·관모)로 만든다
 * - 한 명 = 몸통(말+기수, 합친 지오메트리) + 다리 4 + 무기 + 망토. 다리·무기·망토는 장수끼리 묶어 그린다
 * - GLB 관절 이름: 말 다리 = hip_L/hip_R, 무기 든 팔 = arm_R, 무기 = weapon
 */
import * as THREE from 'three';
import { box, COL, cone, cyl, merge, part, sph } from './kit';

export type Eyes = 'narrow' | 'sharp' | 'calm' | 'phoenix' | 'round' | 'gentle';
export type Beard = 'none' | 'long' | 'spiky' | 'goatee' | 'short';
export type Hat = 'hood' | 'helmet' | 'crown' | 'feather' | 'bare';
export type WeaponKind = 'guandao' | 'snake' | 'halberd' | 'spear' | 'sword';

export interface HeroDesc {
  ch: string;
  skin: string;
  eyes: Eyes;
  beard: Beard;
  hat: Hat;
  hatC: string;
  plume: string;
  armor: string;
  trim: string;
  cape: string;
  horse: string;
  mane: string;
  weapon: WeaponKind;
  ears?: boolean;
  patch?: boolean;
}

/** 시안의 명장 9명 (엔진 무장 id 기준) */
export const HERO_PRESETS: Record<string, Partial<HeroDesc>> = {
  guan_yu: { skin: '#DB7A60', eyes: 'phoenix', beard: 'long', hat: 'hood', hatC: '#3E8A5A', armor: '#4E6A56', trim: '#C9A24A', cape: '#3E8A5A', horse: '#7A5236', mane: '#2B1D14', weapon: 'guandao' },
  zhang_fei: { skin: '#C99068', eyes: 'round', beard: 'spiky', hat: 'helmet', hatC: '#2E2E34', plume: '#202024', armor: '#5A564C', trim: '#9A8A6A', cape: '#2B211B', horse: '#2E2622', mane: '#111111', weapon: 'snake' },
  liu_bei: { skin: '#F3D2AE', eyes: 'gentle', beard: 'short', hat: 'crown', hatC: '#2A2A2A', armor: '#E6DEC8', trim: '#3E7D5A', cape: '#3E7D5A', horse: '#ECE6DA', mane: '#BDB4A2', weapon: 'sword', ears: true },
  lu_bu: { skin: '#F1CDA5', eyes: 'sharp', beard: 'none', hat: 'feather', hatC: '#5A2E44', armor: '#6E3B4E', trim: '#D8B04A', cape: '#C8323B', horse: '#B8422E', mane: '#5A1610', weapon: 'halberd' },
  zhao_yun: { skin: '#F3D2AE', eyes: 'gentle', beard: 'none', hat: 'helmet', hatC: '#E4E2DA', plume: '#C8322B', armor: '#DCDAD2', trim: '#8FA8C0', cape: '#3E7D5A', horse: '#F2EFE8', mane: '#CFC8BA', weapon: 'spear' },
  gao_shun: { skin: '#E6BC92', eyes: 'sharp', beard: 'short', hat: 'helmet', hatC: '#4A3A44', plume: '#8E2E22', armor: '#5A4652', trim: '#9A8A6A', cape: '#3A2A30', horse: '#5C3A26', mane: '#1A120C', weapon: 'sword' },
  zhang_liao: { skin: '#F1CDA5', eyes: 'sharp', beard: 'goatee', hat: 'helmet', hatC: '#6E3B4E', plume: '#D8B04A', armor: '#6E3B4E', trim: '#D8B04A', cape: '#3A2A40', horse: '#8A5A36', mane: '#2A1A10', weapon: 'guandao' },
  cao_cao: { skin: '#F3D2AE', eyes: 'narrow', beard: 'goatee', hat: 'crown', hatC: '#1E1E22', armor: '#2E3E58', trim: '#C9A24A', cape: '#8E2E2A', horse: '#3A302A', mane: '#111111', weapon: 'sword' },
  xiahou_dun: { skin: '#E6BC92', eyes: 'sharp', patch: true, beard: 'short', hat: 'helmet', hatC: '#3A4558', plume: '#C8322B', armor: '#2F5D8A', trim: '#B9C2CC', cape: '#1E2C40', horse: '#5C3A26', mane: '#1A120C', weapon: 'spear' },
};

const SKIN3: Record<string, string> = { base: '#F3D2AE', warm: '#EBC6A0', light: '#F6DCBE', tan: '#E6BC92', red: '#DB7A60', dark: '#C99068', bronze: '#C08A62' };
const HORSES: [string, string][] = [
  ['#7A5236', '#2B1D14'],
  ['#3A302A', '#111111'],
  ['#9A6A40', '#3A2414'],
  ['#D8D0C0', '#9E968A'],
  ['#5C3A26', '#1A120C'],
  ['#B08A5A', '#5A3A1E'],
];
const shade = (hex: string, k: number) => '#' + new THREE.Color(hex).multiplyScalar(k).getHexString();

/** 2D 초상과 같은 얼굴 데이터(portrait.ts faceOf) → 3D 명장 모양 */
export interface HeroLookInput {
  id: string;
  ch: string;
  war: number;
  intelligence: number;
  age: number;
  factionColor: string;
  face: { skin?: string; eyes?: string; beard?: string; head?: string; body?: string; patch?: string; bigEars?: boolean; plume?: string };
}

export function heroDesc(o: HeroLookInput): HeroDesc {
  let h = 0;
  for (let i = 0; i < o.id.length; i++) h = (h * 31 + o.id.charCodeAt(i)) % 100000;
  const f = o.face;
  const eyes = (['narrow', 'sharp', 'calm', 'phoenix', 'round', 'gentle'].includes(f.eyes ?? '') ? f.eyes : 'calm') as Eyes;
  const beard: Beard =
    o.age < 22 ? 'none' : f.beard === 'long' ? 'long' : f.beard === 'spiky' ? 'spiky' : f.beard === 'full' ? 'short' : f.beard === 'none' ? 'none' : f.beard ? 'goatee' : 'short';
  const head = f.head ?? '';
  const hat: Hat = ['guan', 'crown', 'scholar'].includes(head) ? 'crown' : ['helmet', 'band'].includes(head) ? 'helmet' : ['hood', 'taoist'].includes(head) ? 'hood' : head === 'feather' ? 'feather' : 'bare';
  const armorBody = f.body === 'armor' || (f.body !== 'robe' && o.war >= 70);
  const [horse, mane] = HORSES[h % HORSES.length]!;
  const weapon: WeaponKind = o.war >= 90 ? (['guandao', 'spear', 'halberd'] as const)[h % 3]! : o.war >= 72 ? 'spear' : 'sword';
  const base: HeroDesc = {
    ch: o.ch,
    skin: SKIN3[f.skin ?? 'base'] ?? (f.skin?.startsWith('#') ? f.skin : SKIN3.base!),
    eyes,
    beard,
    hat,
    hatC: hat === 'helmet' ? shade(o.factionColor, 0.7) : hat === 'hood' ? o.factionColor : '#1E1A18',
    plume: f.plume ?? COL.RED,
    armor: armorBody ? shade(o.factionColor, 0.85) : '#E6DEC8',
    trim: armorBody ? '#B9A06A' : o.factionColor,
    cape: o.factionColor,
    horse,
    mane,
    weapon,
    ears: f.bigEars,
    patch: !!f.patch,
  };
  return { ...base, ...(HERO_PRESETS[o.id] ?? {}) };
}

// ── 지오메트리 ──
const cap = (r: number, l: number, c = 2, s = 8) => new THREE.CapsuleGeometry(r, l, c, s);
const UP = new THREE.Vector3(0, 1, 0);

function partQ(g: THREE.BufferGeometry, hex: string, p: [number, number, number], dir: THREE.Vector3): THREE.BufferGeometry {
  const q = new THREE.Quaternion().setFromUnitVectors(UP, dir);
  const e = new THREE.Euler().setFromQuaternion(q);
  return part(g, hex, p, [e.x, e.y, e.z]);
}

function eyeParts(st: Eyes) {
  const E = (x: number, r: number, sc: [number, number, number], rz = 0) => part(sph(r, 8, 6), COL.INK, [x, 0.84, 0.236], [0, 0, rz], sc);
  const Hl = (x: number) => part(sph(0.016, 4, 3), COL.WHITE, [x, 0.868, 0.272]);
  switch (st) {
    case 'round':
      return [E(-0.1, 0.062, [1, 1.12, 0.6]), E(0.1, 0.062, [1, 1.12, 0.6]), Hl(-0.08), Hl(0.12)];
    case 'phoenix':
      return [E(-0.1, 0.06, [1.5, 0.42, 0.5], -0.38), E(0.1, 0.06, [1.5, 0.42, 0.5], 0.38)];
    case 'sharp':
      return [E(-0.1, 0.055, [1.3, 0.78, 0.55], -0.22), E(0.1, 0.055, [1.3, 0.78, 0.55], 0.22), Hl(-0.085), Hl(0.115)];
    case 'narrow':
      return [E(-0.1, 0.055, [1.45, 0.3, 0.5], -0.12), E(0.1, 0.055, [1.45, 0.3, 0.5], 0.12)];
    case 'gentle':
      return [E(-0.095, 0.05, [1, 1.25, 0.6]), E(0.095, 0.05, [1, 1.25, 0.6]), Hl(-0.078), Hl(0.112)];
    default:
      return [E(-0.095, 0.045, [1, 1.35, 0.6]), E(0.095, 0.045, [1, 1.35, 0.6]), Hl(-0.08), Hl(0.11)];
  }
}
function browParts(st: Eyes) {
  const B = (x: number, rz: number, w = 0.11, t = 0.026) => part(box(w, t, 0.03), COL.INK, [x, 0.925, 0.245], [0, 0, rz]);
  if (st === 'sharp') return [B(-0.1, -0.35, 0.12, 0.034), B(0.1, 0.35, 0.12, 0.034)];
  if (st === 'round') return [B(-0.1, -0.25, 0.12, 0.04), B(0.1, 0.25, 0.12, 0.04)];
  if (st === 'phoenix') return [B(-0.1, 0.18, 0.13, 0.03), B(0.1, -0.18, 0.13, 0.03)];
  if (st === 'narrow') return [B(-0.1, -0.1, 0.1, 0.022), B(0.1, 0.1, 0.1, 0.022)];
  return [B(-0.095, 0.12, 0.09, 0.02), B(0.095, -0.12, 0.09, 0.02)];
}

function riderGeo(d: HeroDesc): THREE.BufferGeometry {
  const L: THREE.BufferGeometry[] = [
    part(sph(0.27, 12, 9), d.skin, [0, 0.86, 0]),
    ...eyeParts(d.eyes),
    part(sph(0.05, 6, 4), '#F4A296', [-0.165, 0.785, 0.2], [0, -0.6, 0], [1, 0.55, 0.35]),
    part(sph(0.05, 6, 4), '#F4A296', [0.165, 0.785, 0.2], [0, 0.6, 0], [1, 0.55, 0.35]),
    ...browParts(d.eyes),
    part(cyl(0.17, 0.22, 0.32, 12), d.armor, [0, 0.45, 0]),
    part(cyl(0.22, 0.27, 0.12, 12), shade(d.armor, 0.72), [0, 0.31, 0]),
    part(cyl(0.225, 0.225, 0.05, 12), d.trim, [0, 0.37, 0]),
    part(sph(0.1, 8, 6), d.trim, [-0.21, 0.57, 0], [0, 0, 0], [1, 0.75, 1]),
    part(sph(0.1, 8, 6), d.trim, [0.21, 0.57, 0], [0, 0, 0], [1, 0.75, 1]),
    part(cap(0.06, 0.1, 2, 6), d.armor, [-0.22, 0.47, 0.03], [0.3, 0, 0.2]),
    part(sph(0.065, 6, 5), d.skin, [-0.24, 0.4, 0.08]),
    part(box(0.2, 0.15, 0.04), d.trim, [0, 0.5, 0.19], [-0.12, 0, 0]),
    part(cap(0.07, 0.2, 2, 6), COL.BOOT, [-0.25, 0.18, 0.05], [0.35, 0, 0.18]),
    part(cap(0.07, 0.2, 2, 6), COL.BOOT, [0.25, 0.18, 0.05], [0.35, 0, -0.18]),
  ];
  if (d.ears) L.push(part(sph(0.1, 8, 6), d.skin, [-0.27, 0.84, 0], [0, 0, 0], [0.45, 1.15, 0.8]), part(sph(0.1, 8, 6), d.skin, [0.27, 0.84, 0], [0, 0, 0], [0.45, 1.15, 0.8]));
  const must = (w = 0.025) => [part(cap(w, 0.1, 2, 5), COL.INK, [-0.06, 0.735, 0.258], [0, 0, 1.2]), part(cap(w, 0.1, 2, 5), COL.INK, [0.06, 0.735, 0.258], [0, 0, -1.2])];
  if (d.beard === 'long') L.push(part(cone(0.16, 0.6, 10), COL.INK, [0, 0.45, 0.22], [Math.PI + 0.12, 0, 0]), ...must());
  if (d.beard === 'spiky') {
    const C = new THREE.Vector3(0, 0.66, 0.2);
    for (const a of [-1.3, -0.85, -0.42, 0, 0.42, 0.85, 1.3]) {
      const dir = new THREE.Vector3(Math.sin(a) * 0.9, -Math.cos(a), 0.55).normalize();
      L.push(partQ(cone(0.05, 0.22, 4), COL.INK, [C.x + dir.x * 0.1, C.y + dir.y * 0.1, C.z + dir.z * 0.1], dir));
    }
  }
  if (d.beard === 'goatee') L.push(part(cone(0.045, 0.17, 6), COL.INK, [0, 0.56, 0.22], [Math.PI, 0, 0]), ...must(0.016));
  if (d.beard === 'short') L.push(part(sph(0.12, 8, 6), COL.INK, [0, 0.64, 0.17], [0, 0, 0], [1, 0.6, 0.6]), ...must(0.018));
  if (d.patch) L.push(part(cyl(0.072, 0.072, 0.02, 10), COL.INK, [-0.1, 0.845, 0.258], [Math.PI / 2 - 0.15, 0, 0]));
  const dome = (r: number, th: number, c: string) => part(new THREE.SphereGeometry(r, 12, 5, 0, Math.PI * 2, 0, Math.PI * th), c, [0, 0.86, 0]);
  if (d.hat === 'hood')
    L.push(
      dome(0.305, 0.4, d.hatC),
      part(cyl(0.292, 0.302, 0.05, 14), shade(d.hatC, 0.72), [0, 0.955, 0]),
      part(sph(0.08, 6, 5), d.hatC, [0, 1.0, -0.27]),
      part(box(0.07, 0.34, 0.02), d.hatC, [-0.06, 0.8, -0.3], [0.2, 0, 0.15]),
      part(box(0.07, 0.34, 0.02), d.hatC, [0.06, 0.8, -0.3], [0.2, 0, -0.15]),
    );
  if (d.hat === 'helmet') L.push(dome(0.295, 0.42, d.hatC), part(cyl(0.3, 0.31, 0.04, 14), shade(d.hatC, 0.7), [0, 0.935, 0]), part(cone(0.065, 0.34, 6), d.plume, [0, 1.27, -0.02]), part(sph(0.045, 6, 4), COL.GOLD, [0, 1.14, 0]));
  if (d.hat === 'feather') {
    L.push(dome(0.285, 0.4, d.hatC), part(cyl(0.29, 0.3, 0.1, 14), d.trim, [0, 0.96, 0]), part(box(0.2, 0.16, 0.04), d.trim, [0, 1.03, 0.27], [-0.25, 0, 0]));
    for (const s of [-1, 1]) {
      const V3 = (x: number, y: number, z: number) => new THREE.Vector3(x * s, y, z);
      L.push(part(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([V3(0.07, 1.06, 0), V3(0.2, 1.5, -0.05), V3(0.42, 1.92, -0.25), V3(0.72, 2.08, -0.55), V3(0.97, 2.0, -0.8)]), 20, 0.03, 4), '#C8742E'));
    }
  }
  if (d.hat === 'crown')
    L.push(dome(0.285, 0.42, '#1E1A18'), part(cyl(0.16, 0.17, 0.08, 10), d.hatC, [0, 1.13, -0.02]), part(box(0.24, 0.12, 0.34), d.hatC, [0, 1.21, -0.02]), part(cyl(0.012, 0.012, 0.42, 5), COL.GOLD, [0, 1.2, -0.02], [0, 0, Math.PI / 2]));
  if (d.hat === 'bare') L.push(dome(0.285, 0.45, '#1D1B18'), part(sph(0.09, 6, 5), '#1D1B18', [0, 1.13, -0.08]));
  return merge(L);
}

export function horseGeo(coat: string, mane: string): THREE.BufferGeometry {
  return merge(
    part(cap(0.28, 0.56, 2, 8), coat, [0, 0.8, 0], [Math.PI / 2, 0, 0]),
    part(cap(0.14, 0.3, 2, 8), coat, [0, 1.07, 0.42], [0.62, 0, 0]),
    part(cap(0.16, 0.22, 2, 8), coat, [0, 1.28, 0.64], [1.9, 0, 0]),
    part(sph(0.12, 8, 6), shade(coat, 1.15), [0, 1.2, 0.85], [0, 0, 0], [1, 0.85, 1]),
    part(cone(0.055, 0.15, 5), coat, [-0.08, 1.47, 0.56], [-0.2, 0, -0.15]),
    part(cone(0.055, 0.15, 5), coat, [0.08, 1.47, 0.56], [-0.2, 0, 0.15]),
    part(sph(0.035, 5, 4), COL.INK, [-0.13, 1.33, 0.7]),
    part(sph(0.035, 5, 4), COL.INK, [0.13, 1.33, 0.7]),
    part(box(0.07, 0.14, 0.46), mane, [0, 1.2, 0.36], [0.62, 0, 0]),
    part(box(0.07, 0.1, 0.14), mane, [0, 1.44, 0.55], [0.3, 0, 0]),
    part(cone(0.1, 0.55, 6), mane, [0, 0.72, -0.55], [-2.5, 0, 0]),
  );
}
/** 말 다리 (흰색 바탕, 인스턴스 색으로 털색을 입힌다) */
export const horseLegGeo = () => merge(part(cap(0.065, 0.32, 2, 6), COL.WHITE, [0, -0.22, 0]), part(cyl(0.075, 0.08, 0.08, 6), '#2E2420', [0, -0.44, 0]));
export const HLEG: [number, number, number][] = [
  [-0.15, 0.52, 0.32],
  [0.15, 0.52, 0.32],
  [-0.15, 0.52, -0.32],
  [0.15, 0.52, -0.32],
];

/** 말 + 안장(세력색) */
export function mountGeo(d: HeroDesc, fc: string): THREE.BufferGeometry {
  return merge(horseGeo(d.horse, d.mane), part(box(0.62, 0.32, 0.5), fc, [0, 0.84, 0]), part(box(0.48, 0.09, 0.52), shade(fc, 0.65), [0, 1.03, 0]), part(sph(0.06, 6, 4), COL.GOLD, [0, 0.9, 0.27]));
}
/** 기수만 (안장 높이 0.75 를 원점으로). 일기토에서 말에서 떨어지는 연출에 쓴다 */
export function riderOnlyGeo(d: HeroDesc): THREE.BufferGeometry {
  return riderGeo(d);
}
/** 몸통: 말 + 안장 + 기수 (전장에서는 한 덩어리로 그린다) */
export function heroBodyGeo(d: HeroDesc, fc: string): THREE.BufferGeometry {
  const rider = riderGeo(d);
  rider.translate(0, 0.75, 0);
  return merge(mountGeo(d, fc), rider);
}

/** 무기 (손 포함). 팔 관절(기수 기준 0.24, 0.42, 0.07)에서 돌린다 */
export function weaponGeo(kind: WeaponKind, skin: string = COL.SKIN): THREE.BufferGeometry {
  const hand = part(sph(0.07, 6, 5), skin);
  switch (kind) {
    case 'guandao': {
      const sh = new THREE.Shape();
      sh.moveTo(0, 0);
      sh.lineTo(0, 0.62);
      sh.quadraticCurveTo(0.02, 0.82, 0.1, 0.95);
      sh.quadraticCurveTo(0.32, 0.6, 0.27, 0.32);
      sh.quadraticCurveTo(0.2, 0.1, 0.06, 0);
      sh.lineTo(0, 0);
      const bl = new THREE.ExtrudeGeometry(sh, { depth: 0.03, bevelEnabled: false, curveSegments: 6 });
      bl.translate(0, 0, -0.015);
      return merge(part(cyl(0.032, 0.032, 2.3, 6), '#3B5A3A', [0, 0.55, 0]), part(bl, COL.STEEL, [0, 1.62, 0], [0, -Math.PI / 2, 0]), part(sph(0.08, 6, 5), '#2E7A4A', [0, 1.62, 0]), part(cone(0.04, 0.14, 5), COL.STEEL, [0, -0.66, 0], [Math.PI, 0, 0]), hand);
    }
    case 'snake': {
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i <= 12; i++) {
        const t = i / 12;
        pts.push(new THREE.Vector3(Math.sin(t * Math.PI * 3) * 0.07 * (1 - t * 0.6), t * 0.62, 0));
      }
      return merge(part(cyl(0.03, 0.03, 2.4, 6), '#2A2420', [0, 0.6, 0]), part(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, 0.032, 5), COL.STEEL, [0, 1.78, 0], [0, -Math.PI / 2, 0]), part(cone(0.07, 0.18, 6), COL.RED, [0, 1.72, 0], [Math.PI, 0, 0]), hand);
    }
    case 'halberd': {
      const cr = new THREE.Shape();
      cr.absarc(0, 0, 0.26, -1.2, 1.2, false);
      cr.absarc(0.08, 0, 0.2, 1.1, -1.1, true);
      const cg = new THREE.ExtrudeGeometry(cr, { depth: 0.025, bevelEnabled: false, curveSegments: 8 });
      cg.translate(0, 0, -0.0125);
      return merge(part(cyl(0.032, 0.032, 2.3, 6), '#8E2E22', [0, 0.55, 0]), part(cg, COL.STEEL, [0, 1.72, 0], [0, -Math.PI / 2, 0]), part(cg.clone(), COL.STEEL, [0, 1.72, 0], [0, Math.PI / 2, 0]), part(cone(0.055, 0.36, 5), COL.STEEL, [0, 2.0, 0]), hand);
    }
    case 'spear':
      return merge(part(cyl(0.028, 0.028, 2.3, 6), '#6B4A2B', [0, 0.6, 0]), part(cone(0.06, 0.32, 5), COL.STEEL, [0, 1.9, 0]), part(cone(0.08, 0.16, 6), COL.RED, [0, 1.7, 0], [Math.PI, 0, 0]), hand);
    default:
      return merge(part(box(0.065, 0.64, 0.016), COL.STEEL, [0, 0.44, 0]), part(box(0.2, 0.035, 0.06), COL.GOLD, [0, 0.11, 0]), part(cyl(0.026, 0.026, 0.16, 5), '#2A1F18', [0, 0.02, 0]), hand);
  }
}

/** 망토: 위가 0, 아래로 늘어진 판 */
export function capeGeo(): THREE.BufferGeometry {
  const g = new THREE.PlaneGeometry(0.52, 0.7, 2, 4);
  g.translate(0, -0.35, 0);
  return g;
}

/** 명장 크기 (병사보다 크게) */
export const HERO_SCALE = 1.6;
