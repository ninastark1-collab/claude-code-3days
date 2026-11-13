/**
 * 성곽 키트 (임시 코드 모형, 시안 buildCastle·buildCatapult·buildRam·buildLadder 를 칸 단위로 옮긴 것).
 * 모든 조각은 한 칸(CELL) 크기 기준, +x 가 성 바깥 방향이 되도록 만든 뒤 놓을 때 돌린다.
 */
import * as THREE from 'three';
import { box, COL, cone, cyl, merge, part } from './kit';

export const WALL_H = 4.6;
const STONE = '#C2A67E';
const STONE2 = '#CDB28A';
const RED2 = '#A2322A';
const ROOF = '#3F444C';
const PLA = '#ECE4D4';

/** 기와 지붕 (네모뿔을 늘린 우진각 지붕) */
function roof(w: number, d: number, h: number, y: number): THREE.BufferGeometry {
  return part(cone(0.7071, 1, 4), ROOF, [0, y + h / 2, 0], [0, Math.PI / 4, 0], [w, h, d]);
}

/** 판축 성벽 한 칸 (여장 포함) */
export function wallGeo(cell: number): THREE.BufferGeometry {
  const L = [part(box(cell, WALL_H, cell), STONE, [0, WALL_H / 2, 0]), part(box(cell + 0.06, 0.18, cell + 0.06), '#B09670', [0, WALL_H * 0.33, 0]), part(box(cell + 0.06, 0.18, cell + 0.06), '#B09670', [0, WALL_H * 0.66, 0])];
  for (const z of [-cell * 0.33, cell * 0.33]) L.push(part(box(0.55, 0.6, 0.42), STONE2, [cell * 0.42, WALL_H + 0.3, z]));
  return merge(L);
}

/** 성문 칸: 문 위 성벽 + 2층 문루 (붉은 기둥, 기와 지붕). 문짝은 doorGeo 로 따로 */
export function gateTowerGeo(cell: number): THREE.BufferGeometry {
  const L = [
    part(box(cell * 0.7, WALL_H, cell * 0.24), STONE, [0, WALL_H / 2, -cell * 0.38]),
    part(box(cell * 0.7, WALL_H, cell * 0.24), STONE, [0, WALL_H / 2, cell * 0.38]),
    part(box(cell * 0.7, WALL_H - 3.3, cell), STONE, [0, 3.3 + (WALL_H - 3.3) / 2, 0]),
    part(box(cell + 0.4, 0.28, cell + 1.2), '#7A3A2A', [0, WALL_H + 0.14, 0]),
  ];
  for (const x of [-cell * 0.36, cell * 0.36]) for (const z of [-cell * 0.42, cell * 0.42]) L.push(part(cyl(0.13, 0.15, 1.9, 6), RED2, [x, WALL_H + 1.2, z]));
  L.push(part(box(0.15, 1.6, cell * 0.85), PLA, [-cell * 0.36, WALL_H + 1.1, 0]));
  L.push(roof(cell + 1.6, cell + 2, 1.3, WALL_H + 2.15));
  L.push(part(box(cell * 0.55, 1.3, cell * 0.65), PLA, [0, WALL_H + 3.0, 0]), part(box(cell * 0.58, 0.16, cell * 0.68), RED2, [0, WALL_H + 3.62, 0]));
  L.push(roof(cell * 0.95, cell * 1.1, 1.2, WALL_H + 3.7));
  return merge(L);
}

/** 성문 문짝 한 짝 (경첩이 원점, +z 로 뻗음) */
export function doorGeo(cell: number): THREE.BufferGeometry {
  const w = cell * 0.26;
  return merge(part(box(0.22, 3.2, w), '#6E2A1C', [0, 1.6, w / 2]), part(box(0.26, 0.14, w), '#555555', [0, 0.7, w / 2]), part(box(0.26, 0.14, w), '#555555', [0, 1.6, w / 2]), part(box(0.26, 0.14, w), '#555555', [0, 2.5, w / 2]));
}

/** 성 안 기와집 */
export function houseGeo(): THREE.BufferGeometry {
  return merge(part(box(2.2, 1.1, 1.8), '#E8DFCF', [0, 0.55, 0]), part(box(0.1, 0.6, 1.6), RED2, [1.11, 0.5, 0]), roof(2.8, 2.4, 0.9, 1.1));
}

/** 본성 (관청) */
export function keepGeo(): THREE.BufferGeometry {
  const L = [part(box(4.2, 0.4, 3.6), '#B7AE98', [0, 0.2, 0]), part(box(3.4, 1.8, 2.6), PLA, [0, 1.3, 0])];
  for (const x of [-1.5, -0.5, 0.5, 1.5]) L.push(part(cyl(0.11, 0.12, 1.8, 6), RED2, [x, 1.3, 1.32]));
  L.push(roof(4.6, 3.8, 1.2, 2.2), part(box(2.2, 0.9, 1.6), PLA, [0, 3.6, 0]), roof(3.2, 2.6, 1, 4.05), part(box(0.24, 0.6, 0.24), COL.GOLD, [0, 5.3, 0]));
  return merge(L);
}

/** 충차: 지붕 덮인 수레 + 매단 통나무 (통나무는 ramLogGeo 로 따로 흔든다) */
export function ramGeo(): THREE.BufferGeometry {
  const L = [part(box(1.6, 0.25, 3.2), COL.WOOD, [0, 0.55, 0]), part(cone(1.2, 1.2, 4), '#6B4A2B', [0, 2.1, 0], [0, Math.PI / 4, 0], [1.1, 1, 2.2])];
  for (const x of [-0.8, 0.8]) for (const z of [-1.1, 1.1]) L.push(part(cyl(0.38, 0.38, 0.16, 8), '#5A3E26', [x, 0.38, z], [0, 0, Math.PI / 2]));
  for (const x of [-0.7, 0.7]) for (const z of [-1.3, 1.3]) L.push(part(box(0.12, 1.4, 0.12), '#6B4A2B', [x, 1.25, z]));
  return merge(L);
}
export function ramLogGeo(): THREE.BufferGeometry {
  return merge(part(cyl(0.22, 0.22, 3.6, 8), '#7A5236', [0, 0, 0], [Math.PI / 2, 0, 0]), part(cone(0.24, 0.5, 8), '#555555', [0, 0, 2.0], [Math.PI / 2, 0, 0]));
}

/** 운제(사다리): 성벽에 기댄다. 아래가 원점, +y 로 길이 len */
export function ladderGeo(len = WALL_H + 1.2): THREE.BufferGeometry {
  const L = [part(box(0.1, len, 0.1), COL.WOOD, [-0.35, len / 2, 0]), part(box(0.1, len, 0.1), COL.WOOD, [0.35, len / 2, 0])];
  for (let y = 0.4; y < len; y += 0.55) L.push(part(box(0.7, 0.07, 0.07), '#6B4A2B', [0, y, 0]));
  return merge(L);
}

/** 투석기: 틀 + 팔 (팔은 catapultArmGeo 로 따로 돌린다) */
export function catapultGeo(): THREE.BufferGeometry {
  const L = [part(box(1.8, 0.25, 2.6), COL.WOOD, [0, 0.4, 0])];
  for (const x of [-0.7, 0.7]) L.push(part(box(0.18, 1.8, 0.18), '#6B4A2B', [x, 1.3, 0]), part(cyl(0.35, 0.35, 0.14, 8), '#5A3E26', [x * 1.25, 0.35, 0.9], [0, 0, Math.PI / 2]), part(cyl(0.35, 0.35, 0.14, 8), '#5A3E26', [x * 1.25, 0.35, -0.9], [0, 0, Math.PI / 2]));
  L.push(part(box(1.6, 0.16, 0.16), '#5A3E26', [0, 2.15, 0]));
  return merge(L);
}
/** 투석기 팔: 축(원점)에서 +z 로 뻗고 끝에 바구니 */
export function catapultArmGeo(): THREE.BufferGeometry {
  return merge(part(box(0.16, 0.16, 3.2), COL.WOOD, [0, 0, 0.9]), part(cyl(0.3, 0.2, 0.25, 8), '#5A3E26', [0, 0.1, 2.4]), part(box(0.5, 0.5, 0.5), '#555555', [0, -0.2, -0.8]));
}
export function rockGeo(): THREE.BufferGeometry {
  return merge(part(new THREE.DodecahedronGeometry(0.45, 0), '#8C877C'));
}
