/**
 * 엔진 전장 격자(24×16 칸) → 3D 지형.
 * 한 칸 = CELL 월드 단위. 공격군은 서쪽(-x), 성은 동쪽(+x). 엔진 y(행) = 월드 z.
 * 지형 규칙(이동·피해)은 엔진 것이고, 여기서는 칸 종류를 높낮이·색·소품으로 보여 주기만 한다.
 */
import * as THREE from 'three';
import type { Terrain, Tile } from '../../engine/battle/types';
import { clamp, fbm, lerp, mixC, seeded, smooth, type RGB } from '../math';
import { doorGeo, gateTowerGeo, houseGeo, keepGeo, WALL_H, wallGeo } from '../models/castle';
import { box, broadCanopy, COL, flower, grassTuft, kitMaterials, merge, part, pineCanopy, rock, treeTrunk } from '../models/kit';
import { patchWind, type SharedUniforms } from '../shaders';
import { buildGround, instanced, waterMesh } from '../terrain';

export const CELL = 4;

export interface FieldGrid {
  w: number;
  h: number;
  tiles: Tile[];
}

const BASE_H: Record<Terrain, number> = {
  plain: 0.6,
  forest: 0.8,
  mountain: 3.8,
  // 엔진의 강 칸은 건널 수 있는 여울 (얕다). 깊은 물(water)은 못 건넌다
  river: -0.45,
  water: -1.5,
  bridge: -0.45,
  wall: 0.6,
  gate: 0.6,
  town: 0.55,
  keep: 0.55,
};
const TILE_C: Record<Terrain, RGB> = {
  plain: [0.48, 0.63, 0.29],
  forest: [0.34, 0.5, 0.23],
  mountain: [0.55, 0.5, 0.4],
  river: [0.37, 0.33, 0.25],
  water: [0.33, 0.3, 0.24],
  bridge: [0.37, 0.33, 0.25],
  wall: [0.66, 0.6, 0.5],
  gate: [0.64, 0.54, 0.38],
  town: [0.66, 0.6, 0.5],
  keep: [0.66, 0.6, 0.5],
};

/** 칸 좌표 → 월드 좌표 (칸 가운데) */
export function cellToWorld(g: { w: number; h: number }, cx: number, cy: number): [number, number] {
  return [(cx + 0.5 - g.w / 2) * CELL, (cy + 0.5 - g.h / 2) * CELL];
}
export function worldToCell(g: { w: number; h: number }, x: number, z: number): [number, number] {
  return [Math.floor(x / CELL + g.w / 2), Math.floor(z / CELL + g.h / 2)];
}

export function makeHeight(g: FieldGrid) {
  const tileAt = (x: number, y: number) => g.tiles[clamp(y, 0, g.h - 1) * g.w + clamp(x, 0, g.w - 1)]!;
  const th = (x: number, y: number) => BASE_H[tileAt(x, y).t];
  return (x: number, z: number): number => {
    const fx = x / CELL + g.w / 2 - 0.5;
    const fz = z / CELL + g.h / 2 - 0.5;
    const x0 = Math.floor(fx);
    const z0 = Math.floor(fz);
    const u = smooth(0, 1, fx - x0);
    const v = smooth(0, 1, fz - z0);
    let h = lerp(lerp(th(x0, z0), th(x0 + 1, z0), u), lerp(th(x0, z0 + 1), th(x0 + 1, z0 + 1), u), v);
    const t = tileAt(Math.round(fx), Math.round(fz)).t;
    if (t !== 'river' && t !== 'water' && t !== 'bridge' && t !== 'town' && t !== 'keep') h += (fbm(x * 0.05 + 3, z * 0.05 + 7, 3) - 0.5) * (t === 'mountain' ? 2.4 : 0.9);
    // 전장 밖은 산세로 둘러싼다
    const ex = Math.max(0, Math.abs(x) - (g.w * CELL) / 2);
    const ez = Math.max(0, Math.abs(z) - (g.h * CELL) / 2);
    const e = Math.hypot(ex, ez);
    if (e > 0) h += smooth(0, 34, e) * (4 + fbm(x * 0.05 + 1, z * 0.05 + 9, 4) * 14);
    return h;
  };
}

export function makeColor(g: FieldGrid) {
  return (x: number, y: number, z: number, ny: number, c: THREE.Color) => {
    const [cx, cy] = worldToCell(g, x, z);
    const inside = cx >= 0 && cy >= 0 && cx < g.w && cy < g.h;
    const t = inside ? g.tiles[cy * g.w + cx]!.t : 'plain';
    const n = fbm(x * 0.05 + 11, z * 0.05 + 3, 3);
    let col = mixC(TILE_C[t], [0.56, 0.67, 0.31], t === 'plain' ? smooth(0.35, 0.65, n) * 0.6 : 0.1);
    col = mixC(col, [0.53, 0.51, 0.46], smooth(0.86, 0.7, ny));
    if (!inside) col = mixC(col, [0.4, 0.5, 0.3], smooth(4, 10, y) * 0.4);
    c.setRGB(col[0], col[1], col[2], THREE.SRGBColorSpace);
  };
}

const TREE_C = ['#5E8C3A', '#6E9B44', '#4F7D35', '#7EA04A', '#8DAA52'];
const PINE_C = ['#3F6B3A', '#365F35', '#4A7444'];
const TUFT_C = ['#6E9A45', '#7FA850', '#5C8A3C', '#93AF55'];
const FLOWER_C = ['#F4F1E8', '#F2D25A', '#E99AB0', '#B9A6E8'];

export interface GateView {
  tile: number;
  root: THREE.Group;
  doors: THREE.Group[];
  /** 문 열림 0~1 (stage 가 움직인다) */
  open: number;
  broken: boolean;
}

export interface BuiltField {
  group: THREE.Group;
  heightAt: (x: number, z: number) => number;
  /** 병사·장수가 서는 높이 (성벽 위 포함) */
  standAt: (x: number, z: number) => number;
  gates: GateView[];
  walk: import('./sim').Walk;
  ground: THREE.Mesh;
  /** 성벽·성문이 무너지면 부른다 (엔진 칸이 평지로 바뀜) */
  syncWalls(tiles: Tile[]): void;
}

/** 전장 전체를 만든다. 풀·꽃 양은 화질 단계에 따라 (고급 8 / 보통 5 / 절약 3 포기씩 한 칸에) */
export function buildField(U: SharedUniforms, g: FieldGrid, quality: 'high' | 'normal' | 'saver'): BuiltField {
  const tuftsPer = quality === 'high' ? 8 : quality === 'normal' ? 5 : 3;
  const group = new THREE.Group();
  const heightAt = makeHeight(g);
  const ground = buildGround(U, 240, 170, 150, 106, heightAt, makeColor(g), 'battle');
  group.add(ground);
  const water = waterMesh(U, 240, 170, 0.85);
  water.position.y = -0.25;
  group.add(water);
  const rnd = seeded(11);
  const trees: { x: number; y: number; z: number; s: number; ry: number }[] = [];
  const pines: typeof trees = [];
  const tufts: typeof trees = [];
  const flowers: typeof trees = [];
  const rocks: (typeof trees[number] & { sy: number })[] = [];
  const jitter = (cx: number, cy: number) => {
    const [x, z] = cellToWorld(g, cx, cy);
    return [x + rnd(-1.6, 1.6), z + rnd(-1.6, 1.6)] as const;
  };
  for (let cy = 0; cy < g.h; cy++)
    for (let cx = 0; cx < g.w; cx++) {
      const t = g.tiles[cy * g.w + cx]!.t;
      if (t === 'forest')
        for (let k = 0; k < 3; k++) {
          const [x, z] = jitter(cx, cy);
          (rnd() < 0.35 ? pines : trees).push({ x, z, y: heightAt(x, z) - 0.1, s: rnd(0.8, 1.35), ry: rnd(0, 6.28) });
        }
      if (t === 'mountain')
        for (let k = 0; k < 2; k++) {
          const [x, z] = jitter(cx, cy);
          rocks.push({ x, z, y: heightAt(x, z), s: rnd(0.8, 2), sy: rnd(0.4, 0.8), ry: rnd(0, 6) });
          if (rnd() < 0.5) pines.push({ x: x + 1, z, y: heightAt(x + 1, z) - 0.1, s: rnd(0.7, 1.1), ry: rnd(0, 6) });
        }
      if (t === 'plain' || t === 'forest')
        for (let k = 0; k < tuftsPer; k++) {
          const [x, z] = jitter(cx, cy);
          tufts.push({ x, z, y: heightAt(x, z), s: rnd(0.7, 1.4), ry: rnd(0, 6.28) });
          if (k < (quality === 'saver' ? 1 : 2)) flowers.push({ x: x + 0.4, z, y: heightAt(x + 0.4, z) + 0.12, s: rnd(0.7, 1.3), ry: 0 });
        }
    }
  // 전장 밖 숲 (산세)
  for (let k = 0; k < 160; k++) {
    const x = rnd(-110, 110);
    const z = rnd(-78, 78);
    if (Math.abs(x) < (g.w * CELL) / 2 + 4 && Math.abs(z) < (g.h * CELL) / 2 + 4) continue;
    (rnd() < 0.5 ? pines : trees).push({ x, z, y: heightAt(x, z) - 0.1, s: rnd(0.8, 1.5), ry: rnd(0, 6.28) });
  }
  const { toy, flat } = kitMaterials();
  const canopy = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, flatShading: true });
  patchWind(canopy, U, 0.022, 'canopy-b');
  const tuftMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 });
  patchWind(tuftMat, U, 0.3, 'tuft-b');
  const r = () => rnd();
  group.add(
    instanced(treeTrunk(), toy, [...trees, ...pines], null, r),
    instanced(broadCanopy(), canopy, trees, TREE_C, r),
    instanced(pineCanopy(), canopy, pines, PINE_C, r),
    instanced(grassTuft(), tuftMat, tufts, TUFT_C, r, false),
    instanced(flower(), toy, flowers, FLOWER_C, r, false),
    instanced(rock(), flat, rocks.map((q) => ({ ...q, c: '#8C877C' })), ['#8C877C', '#9A9488', '#7B776E'], r),
  );

  const zero = new THREE.Matrix4().makeScale(0, 0, 0);
  // 다리 (강 위를 가로지르는 판자)
  const bridges: THREE.Matrix4[] = [];
  const m4 = new THREE.Matrix4();
  for (let cy = 0; cy < g.h; cy++)
    for (let cx = 0; cx < g.w; cx++)
      if (g.tiles[cy * g.w + cx]!.t === 'bridge') {
        const [x, z] = cellToWorld(g, cx, cy);
        bridges.push(m4.clone().makeTranslation(x, 0.25, z));
      }
  if (bridges.length) {
    const bm = new THREE.InstancedMesh(merge(part(box(CELL + 0.1, 0.22, 2.6), COL.WOOD), part(box(CELL + 0.1, 0.4, 0.12), '#6B4A2B', [0, 0.3, 1.25]), part(box(CELL + 0.1, 0.4, 0.12), '#6B4A2B', [0, 0.3, -1.25])), toy, bridges.length);
    bridges.forEach((m, i) => bm.setMatrixAt(i, m));
    bm.castShadow = bm.receiveShadow = true;
    group.add(bm);
  }

  // 성곽 (판축 성벽·문루·성 안 기와집·관청). 각 조각은 +x 가 바깥이 되게 만들어서 바깥 방향으로 돌린다
  const inCastle = (cx: number, cy: number) => {
    if (cx < 0 || cy < 0 || cx >= g.w || cy >= g.h) return false;
    const t = g.tiles[cy * g.w + cx]!.t;
    return t === 'wall' || t === 'gate' || t === 'town' || t === 'keep';
  };
  const outward = (cx: number, cy: number): number => {
    // 바깥으로 열린 이웃 방향의 회전값 (+x=0, -x=π, -z(북)=π/2, +z(남)=-π/2)
    if (!inCastle(cx - 1, cy)) return Math.PI;
    if (!inCastle(cx + 1, cy)) return 0;
    if (!inCastle(cx, cy - 1)) return Math.PI / 2;
    return -Math.PI / 2;
  };
  const wallIdx: number[] = [];
  const gateIdx: number[] = [];
  const houses: { x: number; y: number; z: number; s: number; ry: number }[] = [];
  g.tiles.forEach((t, i) => {
    const cx = i % g.w;
    const cy = Math.floor(i / g.w);
    if (t.t === 'wall') wallIdx.push(i);
    if (t.t === 'gate') gateIdx.push(i);
    if (t.t === 'town' && rnd() < 0.8) {
      const [x, z] = cellToWorld(g, cx, cy);
      houses.push({ x: x + rnd(-0.6, 0.6), y: heightAt(x, z), z: z + rnd(-0.6, 0.6), s: rnd(0.9, 1.25), ry: rnd() < 0.5 ? 0 : Math.PI / 2 });
    }
  });
  const walls = new THREE.InstancedMesh(wallGeo(CELL), flat, Math.max(1, wallIdx.length));
  walls.castShadow = walls.receiveShadow = true;
  group.add(walls);
  if (houses.length) group.add(instanced(houseGeo(), toy, houses, null, r));
  const doorG = doorGeo(CELL);
  const towerG = gateTowerGeo(CELL);
  const gates: GateView[] = gateIdx.map((ti) => {
    const cx = ti % g.w;
    const cy = Math.floor(ti / g.w);
    const [x, z] = cellToWorld(g, cx, cy);
    const root = new THREE.Group();
    root.position.set(x, heightAt(x, z) - 0.2, z);
    root.rotation.y = outward(cx, cy);
    const tower = new THREE.Mesh(towerG, toy);
    tower.castShadow = tower.receiveShadow = true;
    root.add(tower);
    const doors = [-1, 1].map((s) => {
      const pv = new THREE.Group();
      pv.position.set(CELL * 0.18, 0, s * CELL * 0.26);
      const d = new THREE.Mesh(doorG, toy);
      d.rotation.y = s > 0 ? Math.PI : 0;
      d.castShadow = true;
      pv.add(d);
      root.add(pv);
      return pv;
    });
    group.add(root);
    return { tile: ti, root, doors, open: 0, broken: false };
  });
  const m4b = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const syncWalls = (tiles: Tile[]) => {
    wallIdx.forEach((ti, i) => {
      const cx = ti % g.w;
      const cy = Math.floor(ti / g.w);
      const [x, z] = cellToWorld(g, cx, cy);
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), outward(cx, cy));
      walls.setMatrixAt(i, tiles[ti]?.t === 'wall' ? m4b.compose(new THREE.Vector3(x, heightAt(x, z) - 0.2, z), q, new THREE.Vector3(1, 1, 1)) : zero);
    });
    walls.count = wallIdx.length;
    walls.instanceMatrix.needsUpdate = true;
    for (const gv of gates) gv.broken = tiles[gv.tile]?.t !== 'gate';
  };
  syncWalls(g.tiles);

  // 본성 (관청)
  const ki = g.tiles.findIndex((t) => t.t === 'keep');
  if (ki >= 0) {
    const [x, z] = cellToWorld(g, ki % g.w, Math.floor(ki / g.w));
    const keep = new THREE.Mesh(keepGeo(), toy);
    keep.position.set(x, heightAt(x, z), z);
    keep.rotation.y = Math.PI / 2;
    keep.castShadow = keep.receiveShadow = true;
    group.add(keep);
  }
  /** 서 있는 성벽·성문 칸 위면 성벽 높이 (수비 병사가 성벽 위에 선다), 다리 위면 다리 높이 */
  const tileOf = (x: number, z: number) => {
    const [cx, cy] = worldToCell(g, x, z);
    return cx < 0 || cy < 0 || cx >= g.w || cy >= g.h ? null : g.tiles[cy * g.w + cx]!.t;
  };
  const standAt = (x: number, z: number) => {
    const t = tileOf(x, z);
    if (t === 'wall' || t === 'gate') return heightAt(x, z) - 0.2 + WALL_H;
    if (t === 'bridge') return Math.max(heightAt(x, z), 0.36);
    return heightAt(x, z);
  };
  /**
   * 지형 규칙 (디자인 수정 3): 깊은 물·서 있는 성벽(땅 위 병사)·전장 밖·가파른 벼랑은 못 간다.
   * 성벽 위 병사는 성벽 칸 안에서만. 엔진 강 칸은 여울(건널 수 있음, 느림).
   */
  const halfW = (g.w * CELL) / 2 - 0.4;
  const halfH = (g.h * CELL) / 2 - 0.4;
  const walk = {
    at(x: number, z: number, onWall: boolean): 'ok' | 'ford' | 'block' {
      if (Math.abs(x) > halfW || Math.abs(z) > halfH) return 'block';
      const t = tileOf(x, z);
      const wallish = t === 'wall' || t === 'gate';
      if (onWall) return wallish ? 'ok' : 'block';
      if (wallish || t === 'water') return 'block';
      if (t === 'river') return 'ford';
      // 가파른 벼랑 (산 가장자리)
      const h0 = heightAt(x, z);
      if (Math.abs(heightAt(x + 0.6, z) - h0) > 1.1 || Math.abs(heightAt(x, z + 0.6) - h0) > 1.1) return 'block';
      return 'ok';
    },
    wallCell: (cx: number, cy: number) => {
      const t = g.tiles[cy * g.w + cx]?.t;
      return t === 'wall' || t === 'gate';
    },
    bridgeCell: (cx: number, cy: number) => g.tiles[cy * g.w + cx]?.t === 'bridge',
  };
  return { group, heightAt, standAt, ground, syncWalls, gates, walk };
}
