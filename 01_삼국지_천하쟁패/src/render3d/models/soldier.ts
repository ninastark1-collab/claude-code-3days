/**
 * SD 병사 모형 (임시 코드 모형, 시안 kitDef 를 폰 예산에 맞게 면 수를 줄인 것).
 * 부품 = { geo, tint?, pivots?, anim? }. pivots 가 있는 부품은 관절(다리·팔)로 따로 움직인다.
 * GLB로 바꿀 때 관절 이름: hip_L, hip_R (leg/hleg), arm_R (spear/lance/sword), weapon (bow)
 */
import * as THREE from 'three';
import { box, COL, cone, cyl, merge, part, sph } from './kit';

/** 병사 3종 + 내정 화면의 백성(civ)·농부(farm) */
export type SoldierKind = 'spear' | 'arch' | 'cav' | 'civ' | 'farm';
export type PartAnim = 'leg' | 'hleg' | 'spear' | 'bow' | 'lance' | 'hoe';
export interface KitPart {
  geo: THREE.BufferGeometry;
  /** 세력색(fc) / 말털색(coat) 으로 인스턴스 색을 입힌다 */
  tint?: 'fc' | 'coat';
  pivots?: [number, number, number][];
  anim?: PartAnim;
  /** GLB 관절 이름 (교체용 표시) */
  joint?: 'hip_L/hip_R' | 'arm_R' | 'weapon';
}

/** 폰 예산: 병사 1명 삼각형 약 350 (기병 약 800). 면 수를 시안보다 크게 줄였다 */
const cap = (r: number, l: number, c = 1, s = 6) => new THREE.CapsuleGeometry(r, l, c, s);
const BLUSH = '#F4A296';
/** 뚜껑 없는 원통 (보이지 않는 위아래 면을 뺀다) */
const tube = (a: number, b: number, h: number, seg: number) => new THREE.CylinderGeometry(a, b, h, seg, 1, true);
const shade = (hex: string, k: number) => '#' + new THREE.Color(hex).multiplyScalar(k).getHexString();

function headParts(y: number) {
  const E = (x: number) => part(sph(0.05, 4, 3), COL.INK, [x, 0.84 + y, 0.236], [0, 0, 0], [1, 1.3, 0.6]);
  return [
    part(sph(0.27, 9, 6), COL.SKIN, [0, 0.86 + y, 0]),
    E(-0.095),
    E(0.095),
    part(sph(0.05, 3, 2), BLUSH, [-0.165, 0.785 + y, 0.2], [0, -0.6, 0], [1, 0.55, 0.35]),
    part(sph(0.05, 3, 2), BLUSH, [0.165, 0.785 + y, 0.2], [0, 0.6, 0], [1, 0.55, 0.35]),
  ];
}

function horseGeo(coat: string, mane: string) {
  return merge(
    part(cap(0.28, 0.56, 1, 7), coat, [0, 0.8, 0], [Math.PI / 2, 0, 0]),
    part(cap(0.14, 0.3, 1, 5), coat, [0, 1.07, 0.42], [0.62, 0, 0]),
    part(cap(0.16, 0.22, 1, 5), coat, [0, 1.28, 0.64], [1.9, 0, 0]),
    part(sph(0.12, 5, 4), shade(coat, 1.15), [0, 1.2, 0.85], [0, 0, 0], [1, 0.85, 1]),
    part(cone(0.055, 0.15, 3), coat, [-0.08, 1.47, 0.56], [-0.2, 0, -0.15]),
    part(cone(0.055, 0.15, 3), coat, [0.08, 1.47, 0.56], [-0.2, 0, 0.15]),
    part(box(0.07, 0.14, 0.46), mane, [0, 1.2, 0.36], [0.62, 0, 0]),
    part(cone(0.1, 0.55, 4), mane, [0, 0.72, -0.55], [-2.5, 0, 0]),
  );
}
const HLEG: [number, number, number][] = [
  [-0.15, 0.52, 0.32],
  [0.15, 0.52, 0.32],
  [-0.15, 0.52, -0.32],
  [0.15, 0.52, -0.32],
];

const cache: Partial<Record<SoldierKind, KitPart[]>> = {};

/** 병종별 병사 부품 (창병 spear / 궁병 arch / 기병 cav) */
export function soldierParts(kind: SoldierKind): KitPart[] {
  if (cache[kind]) return cache[kind]!;
  if (kind === 'civ' || kind === 'farm') return (cache[kind] = civilianParts(kind === 'farm'));
  const cav = kind === 'cav';
  const yo = cav ? 0.75 : 0;
  const parts: KitPart[] = [];
  const neu = [...headParts(yo), part(cone(0.055, 0.16, 4), COL.RED, [0, 1.2 + yo, -0.02]), part(tube(0.215, 0.215, 0.05, 8), COL.BELT, [0, 0.37 + yo, 0]), part(sph(0.06, 4, 3), COL.SKIN, [-0.24, 0.4 + yo, 0.08])];
  if (kind === 'arch') neu.push(part(sph(0.06, 4, 3), COL.SKIN, [0.24, 0.42, 0.04]), part(cyl(0.065, 0.055, 0.38, 5), '#7A5232', [0.13, 0.6, -0.22], [0.25, 0, -0.35]));
  if (cav) neu.push(part(cap(0.065, 0.2, 1, 5), COL.BOOT, [-0.25, 0.93, 0.05], [0.35, 0, 0.18]), part(cap(0.065, 0.2, 1, 5), COL.BOOT, [0.25, 0.93, 0.05], [0.35, 0, -0.18]));
  parts.push({ geo: merge(neu) });
  // 세력색 옷·투구
  const fac = [
    part(tube(0.16, 0.21, 0.32, 8), COL.WHITE, [0, 0.45 + yo, 0]),
    part(tube(0.21, 0.26, 0.12, 8), '#C4C4C4', [0, 0.31 + yo, 0]),
    part(new THREE.SphereGeometry(0.29, 9, 3, 0, Math.PI * 2, 0, Math.PI * 0.42), COL.WHITE, [0, 0.86 + yo, 0]),
    part(tube(0.296, 0.306, 0.035, 9), '#9C9C9C', [0, 0.935 + yo, 0]),
    part(sph(0.09, 4, 3), '#DADADA', [-0.2, 0.56 + yo, 0], [0, 0, 0], [1, 0.8, 1]),
    part(sph(0.09, 4, 3), '#DADADA', [0.2, 0.56 + yo, 0], [0, 0, 0], [1, 0.8, 1]),
  ];
  if (cav) fac.push(part(box(0.6, 0.3, 0.48), COL.WHITE, [0, 0.84, 0]), part(box(0.46, 0.08, 0.5), '#AAAAAA', [0, 1.02, 0]));
  parts.push({ geo: merge(fac), tint: 'fc' });
  if (cav) {
    parts.push({ geo: horseGeo(COL.WHITE, '#555555'), tint: 'coat' });
    parts.push({ geo: merge(part(box(0.11, 0.42, 0.11), COL.WHITE, [0, -0.22, 0]), part(box(0.14, 0.08, 0.14), '#2E2420', [0, -0.44, 0])), tint: 'coat', pivots: HLEG, anim: 'hleg', joint: 'hip_L/hip_R' });
  } else
    parts.push({
      geo: merge(part(box(0.13, 0.26, 0.15), COL.BOOT, [0, -0.15, 0])),
      pivots: [
        [-0.09, 0.29, 0],
        [0.09, 0.29, 0],
      ],
      anim: 'leg',
      joint: 'hip_L/hip_R',
    });
  const hand = part(sph(0.06, 4, 3), COL.SKIN, [0, 0, 0]);
  if (kind === 'spear')
    parts.push({
      geo: merge(part(tube(0.02, 0.02, 1.9, 3), COL.WOOD, [0, 0.35, 0]), part(cone(0.045, 0.2, 5), COL.STEEL, [0, 1.4, 0]), part(cone(0.05, 0.1, 5), COL.RED, [0, 1.24, 0], [Math.PI, 0, 0]), hand),
      pivots: [[0.24, 0.42, 0.07]],
      anim: 'spear',
      joint: 'arm_R',
    });
  if (kind === 'arch')
    parts.push({
      geo: merge(part(new THREE.TorusGeometry(0.32, 0.018, 3, 8, Math.PI), '#6B3E22', [0, 0, 0], [0, Math.PI / 2, Math.PI / 2]), part(tube(0.006, 0.006, 0.64, 3), '#EEEEEE')),
      pivots: [[-0.24, 0.45, 0.1]],
      anim: 'bow',
      joint: 'weapon',
    });
  if (cav)
    parts.push({
      geo: merge(part(tube(0.024, 0.024, 2.3, 3), COL.WOOD, [0, 0.6, 0]), part(cone(0.05, 0.24, 5), COL.STEEL, [0, 1.85, 0]), part(box(0.012, 0.16, 0.24), COL.RED, [0, 1.6, -0.12]), hand),
      pivots: [[0.24, 1.17, 0.07]],
      anim: 'lance',
      joint: 'arm_R',
    });
  return (cache[kind] = parts);
}

/** 병종 하나의 삼각형 수 (예산 계산용) */
export function soldierTriangles(kind: SoldierKind): number {
  return soldierParts(kind).reduce((s, p) => s + (p.geo.attributes.position!.count / 3) * (p.pivots?.length ?? 1), 0);
}

export const COATS = ['#7A5236', '#3A302A', '#9A6A40', '#D8D0C0', '#5C3A26', '#B08A5A'];

/** 백성·농부 (옷은 인스턴스 색 fc, 농부는 삿갓과 괭이) */
function civilianParts(farmer: boolean): KitPart[] {
  const parts: KitPart[] = [];
  const neu = [...headParts(0), part(sph(0.06, 4, 3), COL.SKIN, [-0.24, 0.4, 0.08])];
  if (farmer) neu.push(part(cone(0.42, 0.22, 8), '#D8C08A', [0, 1.2, 0]));
  else neu.push(part(new THREE.SphereGeometry(0.29, 9, 3, 0, Math.PI * 2, 0, Math.PI * 0.42), '#2A2420', [0, 0.86, 0]));
  parts.push({ geo: merge(neu) });
  parts.push({ geo: merge(part(tube(0.16, 0.24, 0.42, 8), COL.WHITE, [0, 0.42, 0]), part(tube(0.24, 0.27, 0.1, 8), '#DDDDDD', [0, 0.24, 0])), tint: 'fc' });
  parts.push({
    geo: merge(part(box(0.12, 0.24, 0.14), '#4A3426', [0, -0.15, 0])),
    pivots: [
      [-0.09, 0.27, 0],
      [0.09, 0.27, 0],
    ],
    anim: 'leg',
    joint: 'hip_L/hip_R',
  });
  if (farmer)
    parts.push({ geo: merge(part(tube(0.02, 0.02, 1.2, 3), COL.WOOD, [0, 0.3, 0]), part(box(0.22, 0.04, 0.18), '#777777', [0, 0.9, 0.08]), part(sph(0.06, 4, 3), COL.SKIN)), pivots: [[0.24, 0.42, 0.07]], anim: 'hoe', joint: 'arm_R' });
  return parts;
}
