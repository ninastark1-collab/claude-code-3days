/**
 * 지형: 높이 함수로 만든 지면 메시, 물, 숲·풀·꽃·바위 (시안 buildTerrain·waterMesh·addFoliage)
 * 소품은 종류마다 InstancedMesh 하나 (그리기 호출 절약)
 */
import * as THREE from 'three';
import { fbm, mixC, seeded, smooth, lerp, type RGB } from './math';
import { broadCanopy, flower, grassTuft, kitMaterials, pineCanopy, rock, treeTrunk } from './models/kit';
import { patchTerrain, patchWater, patchWind, type SharedUniforms } from './shaders';

export type HeightFn = (x: number, z: number) => number;
export type ColorFn = (x: number, y: number, z: number, ny: number, out: THREE.Color) => void;

export function buildGround(U: SharedUniforms, w: number, d: number, sx: number, sz: number, hf: HeightFn, cf: ColorFn, key: string): THREE.Mesh {
  const g = new THREE.PlaneGeometry(w, d, sx, sz);
  g.rotateX(-Math.PI / 2);
  const p = g.attributes.position!;
  for (let i = 0; i < p.count; i++) p.setY(i, hf(p.getX(i), p.getZ(i)));
  g.computeVertexNormals();
  const n = g.attributes.normal!;
  const cols = new Float32Array(p.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    cf(p.getX(i), p.getY(i), p.getZ(i), n.getY(i), c);
    cols[i * 3] = c.r;
    cols[i * 3 + 1] = c.g;
    cols[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 });
  patchTerrain(m, U, key);
  const mesh = new THREE.Mesh(g, m);
  mesh.receiveShadow = true;
  return mesh;
}

export function waterMesh(U: SharedUniforms, w: number, d: number, opacity = 0.82, color = '#3A6F86'): THREE.Mesh {
  const m = new THREE.MeshStandardMaterial({ color, roughness: 0.12, metalness: 0.1, transparent: true, opacity });
  patchWater(m, U);
  const g = new THREE.PlaneGeometry(w, d, 1, 1);
  g.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(g, m);
  mesh.receiveShadow = true;
  return mesh;
}

// ── 평원 (1단계 빈 장면 / 2단계 이후 들판 전장의 기본 지형) ──
export const streamZ = (x: number) => -25 + Math.sin(x * 0.06 + 1) * 5;
export const roadZ = (x: number) => 8 + Math.sin(x * 0.045) * 4;
export const plainHeight: HeightFn = (x, z) => {
  let h = 0.8 + (fbm(x * 0.03 + 3, z * 0.03 + 7, 4) - 0.5) * 1.8;
  const e = Math.max(smooth(28, 62, Math.abs(z + (z < 0 ? 6 : 0))), smooth(52, 95, Math.abs(x)));
  h += e * (4 + fbm(x * 0.05 + 1, z * 0.05 + 9, 4) * 14);
  const sd = Math.abs(z - streamZ(x));
  if (sd < 2.6) h = lerp(-1.15, h, smooth(0.9, 2.6, sd));
  return h;
};
const GRASS1: RGB = [0.42, 0.6, 0.27];
const GRASS2: RGB = [0.56, 0.67, 0.31];
const GRASS3: RGB = [0.34, 0.5, 0.23];
const DIRT: RGB = [0.64, 0.54, 0.38];
const ROCK: RGB = [0.53, 0.51, 0.46];
const MUD: RGB = [0.37, 0.33, 0.25];
export const plainColor: ColorFn = (x, y, z, ny, c) => {
  const n = fbm(x * 0.05 + 11, z * 0.05 + 3, 3);
  let col = mixC(GRASS1, GRASS2, smooth(0.35, 0.65, n));
  col = mixC(col, GRASS3, smooth(0.55, 0.75, fbm(x * 0.11, z * 0.11, 2)) * 0.6);
  col = mixC(col, DIRT, smooth(2.2, 1.1, Math.abs(z - roadZ(x))) * 0.9);
  col = mixC(col, MUD, smooth(3.2, 1.6, Math.abs(z - streamZ(x))));
  col = mixC(col, ROCK, smooth(0.86, 0.7, ny));
  col = mixC(col, [0.4, 0.5, 0.3], smooth(4, 10, y) * 0.4);
  c.setRGB(col[0], col[1], col[2], THREE.SRGBColorSpace);
};

// ── 숲·풀·꽃·바위 ──
const TREE_C = ['#5E8C3A', '#6E9B44', '#4F7D35', '#7EA04A', '#8DAA52'];
const PINE_C = ['#3F6B3A', '#365F35', '#4A7444'];
const TUFT_C = ['#6E9A45', '#7FA850', '#5C8A3C', '#93AF55'];
const FLOWER_C = ['#F4F1E8', '#F2D25A', '#E99AB0', '#B9A6E8'];
const ROCK_C = ['#8C877C', '#9A9488', '#7B776E'];

interface Inst {
  x: number;
  y: number;
  z: number;
  s: number;
  sy?: number;
  ry?: number;
  c?: string;
}

const _E = new THREE.Euler();
const _Q = new THREE.Quaternion();
const _V = new THREE.Vector3();
const _S = new THREE.Vector3();
const _M = new THREE.Matrix4();

export function instanced(geo: THREE.BufferGeometry, mat: THREE.Material, list: Inst[], colors: string[] | null, rnd: () => number, shadow = true): THREE.InstancedMesh {
  const m = new THREE.InstancedMesh(geo, mat, Math.max(1, list.length));
  const c = new THREE.Color();
  list.forEach((t, i) => {
    _E.set(0, t.ry ?? 0, 0);
    _Q.setFromEuler(_E);
    _M.compose(_V.set(t.x, t.y, t.z), _Q, _S.set(t.s, t.sy ?? t.s, t.s));
    m.setMatrixAt(i, _M);
    if (colors) m.setColorAt(i, c.set(t.c ?? colors[Math.floor(rnd() * colors.length)]!));
  });
  m.count = list.length;
  m.castShadow = shadow;
  m.receiveShadow = true;
  return m;
}

export interface FoliageOpts {
  trees: number;
  pines: number;
  tufts: number;
  flowers: number;
  rocks: number;
  treeOk: (x: number, z: number) => boolean;
  tuftOk: (x: number, z: number) => boolean;
  seed?: number;
}

/** 숲·풀·꽃·바위를 깐다. 그리기 호출 5회 */
export function buildFoliage(U: SharedUniforms, hAt: HeightFn, o: FoliageOpts): THREE.Group {
  const rnd = seeded(o.seed ?? 7);
  const R = (a: number, b: number) => rnd(a, b);
  const broad: Inst[] = [];
  const pine: Inst[] = [];
  const tufts: Inst[] = [];
  const flowers: Inst[] = [];
  const rocks: Inst[] = [];
  for (let k = 0; k < o.trees * 8 && broad.length + pine.length < o.trees; k++) {
    const x = R(-110, 110);
    const z = R(-78, 78);
    if (!o.treeOk(x, z)) continue;
    if (fbm(x * 0.04 + 20, z * 0.04, 2) < 0.42 && rnd() < 0.7) continue;
    const t = { x, z, y: hAt(x, z) - 0.1, s: R(0.75, 1.5), ry: R(0, 6.28) };
    (rnd() < o.pines ? pine : broad).push(t);
  }
  for (let k = 0; k < o.tufts * 3 && tufts.length < o.tufts; k++) {
    const x = R(-75, 75);
    const z = R(-48, 48);
    if (o.tuftOk(x, z)) tufts.push({ x, z, y: hAt(x, z), s: R(0.7, 1.4), ry: R(0, 6.28) });
  }
  for (let k = 0; k < o.flowers * 3 && flowers.length < o.flowers; k++) {
    const x = R(-70, 70);
    const z = R(-45, 45);
    if (o.tuftOk(x, z)) flowers.push({ x, z, y: hAt(x, z) + 0.12, s: R(0.7, 1.3) });
  }
  for (let k = 0; k < o.rocks * 4 && rocks.length < o.rocks; k++) {
    const x = R(-100, 100);
    const z = R(-70, 70);
    if (o.treeOk(x, z)) rocks.push({ x, z, y: hAt(x, z), s: R(0.5, 1.8), sy: R(0.35, 0.8), ry: R(0, 6), c: ROCK_C[Math.floor(rnd() * 3)] });
  }
  const { toy, flat } = kitMaterials();
  const canopyMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, flatShading: true });
  patchWind(canopyMat, U, 0.022, 'canopy');
  const tuftMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 });
  patchWind(tuftMat, U, 0.3, 'tuft');
  const g = new THREE.Group();
  g.add(
    instanced(treeTrunk(), toy, [...broad, ...pine], null, rnd),
    instanced(broadCanopy(), canopyMat, broad, TREE_C, rnd),
    instanced(pineCanopy(), canopyMat, pine, PINE_C, rnd),
    instanced(grassTuft(), tuftMat, tufts, TUFT_C, rnd, false),
    instanced(flower(), toy, flowers, FLOWER_C, rnd, false),
    instanced(rock(), flat, rocks, null, rnd),
  );
  // 바위는 개별 색 (colors 대신 c)
  const rm = g.children[5] as THREE.InstancedMesh;
  const c = new THREE.Color();
  rocks.forEach((t, i) => rm.setColorAt(i, c.set(t.c!)));
  return g;
}
