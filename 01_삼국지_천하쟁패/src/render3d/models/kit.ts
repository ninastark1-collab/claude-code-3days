/**
 * 모형 만드는 부분 (임시 코드 모형). 정식 아트(GLB)로 바꿀 때는 이 폴더만 갈아 끼운다.
 * - 기본 도형을 색칠·배치해 하나의 지오메트리로 합친다 (그리기 호출을 줄이기 위해 정점 색 사용)
 * - 병사·장수 모형의 관절 이름 규칙: hip_L, hip_R, arm_R, weapon (2단계 이후 units/heroes 가 사용)
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export const sph = (r: number, w = 14, h = 10) => new THREE.SphereGeometry(r, w, h);
export const cyl = (a: number, b: number, h: number, s = 12) => new THREE.CylinderGeometry(a, b, h, s);
export const cone = (r: number, h: number, s = 8) => new THREE.ConeGeometry(r, h, s);
export const box = (x: number, y: number, z: number) => new THREE.BoxGeometry(x, y, z);

export const COL = {
  SKIN: '#F3D2AE',
  INK: '#2A1F18',
  BOOT: '#4A3426',
  BELT: '#6B4A2B',
  GOLD: '#D9B45A',
  STEEL: '#CBD3D8',
  WOOD: '#8A6A45',
  RED: '#C8322B',
  WHITE: '#FFFFFF',
} as const;

const _E = new THREE.Euler();
const _Q = new THREE.Quaternion();
const _V = new THREE.Vector3();
const _S = new THREE.Vector3();
const _M4 = new THREE.Matrix4();

function colorize(g: THREE.BufferGeometry, hex: string): THREE.BufferGeometry {
  const c = new THREE.Color(hex);
  const n = g.attributes.position!.count;
  const a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    a[i * 3] = c.r;
    a[i * 3 + 1] = c.g;
    a[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g;
}
function prep(g: THREE.BufferGeometry): THREE.BufferGeometry {
  g = g.index ? g.toNonIndexed() : g.clone();
  for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
  if (!g.attributes.normal) g.computeVertexNormals();
  g.clearGroups();
  return g;
}

/** 도형 하나를 색칠하고 위치·회전·크기를 입힌다 */
export function part(g: THREE.BufferGeometry, hex: string, p: [number, number, number] = [0, 0, 0], r: [number, number, number] = [0, 0, 0], s: [number, number, number] = [1, 1, 1]): THREE.BufferGeometry {
  g = prep(g);
  _E.set(r[0], r[1], r[2]);
  _Q.setFromEuler(_E);
  _M4.compose(_V.set(p[0], p[1], p[2]), _Q, _S.set(s[0], s[1], s[2]));
  g.applyMatrix4(_M4);
  return colorize(g, hex);
}

/** 여러 부품을 하나로 합친다 */
export const merge = (...l: (THREE.BufferGeometry | THREE.BufferGeometry[])[]) => mergeGeometries(l.flat());

let mats: { toy: THREE.MeshStandardMaterial; flat: THREE.MeshStandardMaterial } | null = null;
/** 장난감 질감 공용 재질 (정점 색) */
export function kitMaterials() {
  mats ??= {
    toy: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.58, metalness: 0 }),
    flat: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, flatShading: true }),
  };
  return mats;
}

// ── 지형 소품 ──
export const treeTrunk = () => merge(part(cyl(0.13, 0.2, 1.4, 6), '#6B4A2B', [0, 0.7, 0]));
export const broadCanopy = () =>
  merge(
    part(new THREE.IcosahedronGeometry(1, 1), COL.WHITE, [0, 2.2, 0], [0, 0, 0], [1.15, 1, 1.15]),
    part(new THREE.IcosahedronGeometry(0.72, 1), '#E8E8E8', [0.6, 1.8, 0.2]),
    part(new THREE.IcosahedronGeometry(0.68, 1), '#F0F0F0', [-0.5, 1.85, -0.3]),
  );
export const pineCanopy = () =>
  merge(part(cone(1.05, 1.7, 7), COL.WHITE, [0, 1.7, 0]), part(cone(0.82, 1.45, 7), '#E6E6E6', [0, 2.5, 0]), part(cone(0.56, 1.15, 7), '#DADADA', [0, 3.2, 0]));
export const grassTuft = () =>
  merge(
    part(cone(0.06, 0.5, 3), COL.WHITE, [0, 0.25, 0], [0, 0, 0.25]),
    part(cone(0.06, 0.45, 3), COL.WHITE, [0.06, 0.22, 0.03], [0, 1, -0.3]),
    part(cone(0.05, 0.38, 3), COL.WHITE, [-0.05, 0.19, -0.04], [0, 2, 0.35]),
  );
/** 들꽃: 팔면체 (구 60면 → 8면, 900송이 기준 삼각형 약 4.6만 개 절약) */
export const flower = () => merge(part(new THREE.OctahedronGeometry(0.08, 0), COL.WHITE));
export const rock = () => merge(part(new THREE.DodecahedronGeometry(0.6, 0), COL.WHITE));
export const plankBridge = (len = 7.4, y = 0.25) =>
  merge(
    part(box(2.6, 0.2, len), COL.WOOD, [0, y, 0]),
    ...[-1, 1].flatMap((s) => [part(box(0.12, 0.5, len), '#6B4A2B', [s * 1.25, y + 0.35, 0]), ...[-3, -1, 1, 3].map((z) => part(cyl(0.1, 0.1, 1.6, 6), '#5A3E26', [s * 1.25, y - 0.4, z]))]),
  );
