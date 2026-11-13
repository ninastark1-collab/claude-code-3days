/**
 * 병종 하나 = 부품마다 InstancedMesh 하나. 병사가 몇 명이든 그리기 호출은 부품 수만큼 (시안 Kit).
 */
import * as THREE from 'three';
import { ease, lerp } from '../math';
import { kitMaterials } from '../models/kit';
import { soldierParts, type KitPart, type SoldierKind } from '../models/soldier';

/** 그리기에 필요한 병사 상태 (sim.ts 의 Soldier 가 이 모양을 채운다) */
export interface PoseState {
  x: number;
  y: number;
  z: number;
  yaw: number;
  walk: number;
  move: number;
  bob: number;
  lean: number;
  /** 공격 동작 진행 0~1, 없으면 -1 */
  atk: number;
  pose: 'up' | 'low';
  aimV: number;
  dead: boolean;
  fall: number;
  fallSign: number;
  /** 화면에서 지움 (사라짐·숨은 적) */
  hide: boolean;
  scale: number;
  fc: THREE.Color;
  coat: THREE.Color;
}

const HPH = [0, Math.PI * 0.5, Math.PI, Math.PI * 1.5];
const _E = new THREE.Euler();
const _Q = new THREE.Quaternion();
const _V = new THREE.Vector3();
const _S = new THREE.Vector3();
const ONE = new THREE.Vector3(1, 1, 1);
const _B = new THREE.Matrix4();
const _L = new THREE.Matrix4();
const _O = new THREE.Matrix4();
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);

function baseMat(s: PoseState, out: THREE.Matrix4): THREE.Matrix4 {
  const f = s.dead ? ease(Math.min(1, s.fall)) : 0;
  const tilt = s.dead ? s.fallSign * f * 1.45 : s.lean;
  _E.set(tilt, s.yaw, 0, 'YXZ');
  _Q.setFromEuler(_E);
  _E.order = 'XYZ';
  return out.compose(_V.set(s.x, s.y + s.bob, s.z), _Q, _S.setScalar(s.scale));
}

function partLocal(p: KitPart, s: PoseState, k: number, out: THREE.Matrix4): THREE.Matrix4 {
  const pv = p.pivots![k]!;
  let rx = 0;
  let oz = 0;
  let oy = 0;
  switch (p.anim) {
    case 'leg':
      rx = Math.sin(s.walk) * 0.75 * s.move * (k ? -1 : 1);
      break;
    case 'hleg':
      rx = Math.sin(s.walk * 0.8 + HPH[k]!) * 0.85 * s.move;
      break;
    case 'spear':
      if (s.pose === 'low') {
        rx = 1.32;
        oz = s.atk >= 0 ? Math.sin(Math.min(1, s.atk) * Math.PI) * 0.38 : 0;
        oy = 0.04;
      } else rx = 0.12 + Math.sin(s.walk) * 0.05 * s.move;
      break;
    case 'bow':
      rx = lerp(0.55, -0.35, s.aimV);
      break;
    case 'hoe':
      rx = s.atk >= 0 ? (s.atk < 0.5 ? lerp(0.4, -1.3, ease(s.atk / 0.5)) : lerp(-1.3, 1.1, ease((s.atk - 0.5) / 0.5))) : 0.4 + Math.sin(s.walk) * 0.1 * s.move;
      break;
    case 'lance':
      rx = 1.18 + Math.sin(s.walk * 0.8) * 0.06 * s.move + (s.atk >= 0 ? -Math.sin(s.atk * Math.PI) * 0.4 : 0);
      break;
  }
  _E.set(rx, 0, 0);
  _Q.setFromEuler(_E);
  return out.compose(_V.set(pv[0], pv[1] + oy, pv[2] + oz), _Q, ONE);
}

export class InstancedKit {
  private parts: (KitPart & { per: number; mesh: THREE.InstancedMesh })[];
  readonly list: PoseState[] = [];

  constructor(
    scene: THREE.Object3D,
    readonly kind: SoldierKind,
    readonly max: number,
    shadow: boolean,
  ) {
    const mat = kitMaterials().toy;
    this.parts = soldierParts(kind).map((p) => {
      const per = p.pivots ? p.pivots.length : 1;
      const mesh = new THREE.InstancedMesh(p.geo, mat, Math.max(1, max * per));
      mesh.castShadow = shadow;
      mesh.frustumCulled = false;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.count = 0;
      if (p.tint) mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(Math.max(1, max * per) * 3).fill(1), 3);
      scene.add(mesh);
      return { ...p, per, mesh };
    });
  }

  add(s: PoseState): boolean {
    const i = this.list.length;
    if (i >= this.max) return false;
    this.list.push(s);
    for (const p of this.parts)
      if (p.tint) {
        const c = p.tint === 'coat' ? s.coat : s.fc;
        for (let k = 0; k < p.per; k++) p.mesh.setColorAt(i * p.per + k, c);
        p.mesh.instanceColor!.needsUpdate = true;
      }
    return true;
  }

  sync(): void {
    const L = this.list;
    for (let i = 0; i < L.length; i++) {
      const s = L[i]!;
      if (s.hide) {
        for (const p of this.parts) for (let k = 0; k < p.per; k++) p.mesh.setMatrixAt(i * p.per + k, ZERO);
        continue;
      }
      baseMat(s, _B);
      for (const p of this.parts)
        for (let k = 0; k < p.per; k++) {
          if (p.anim) {
            partLocal(p, s, k, _L);
            _O.multiplyMatrices(_B, _L);
            p.mesh.setMatrixAt(i * p.per + k, _O);
          } else p.mesh.setMatrixAt(i * p.per + k, _B);
        }
    }
    for (const p of this.parts) {
      p.mesh.count = L.length * p.per;
      p.mesh.instanceMatrix.needsUpdate = true;
    }
  }

  dispose(): void {
    for (const p of this.parts) p.mesh.dispose();
  }
}
