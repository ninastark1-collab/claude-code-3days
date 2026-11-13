/**
 * 전장 위 명장들을 그린다. 몸통(말+기수)은 장수마다 메시 하나, 말 다리·무기·망토는 장수끼리 묶어 그린다
 * (장수 15명 기준 그리기 호출 약 20회).
 */
import * as THREE from 'three';
import { ease, lerp } from '../math';
import { capeGeo, HERO_SCALE, heroBodyGeo, HLEG, horseLegGeo, weaponGeo, type HeroDesc, type WeaponKind } from '../models/hero';
import { kitMaterials } from '../models/kit';
import type { HeroState } from './sim';

const HPH = [0, Math.PI * 0.5, Math.PI, Math.PI * 1.5];
const _E = new THREE.Euler();
const _Q = new THREE.Quaternion();
const _V = new THREE.Vector3();
const _S = new THREE.Vector3();
const _M = new THREE.Matrix4();
const _B = new THREE.Matrix4();
const _L = new THREE.Matrix4();
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
const ONE = new THREE.Vector3(1, 1, 1);

export interface HeroEntry {
  state: HeroState;
  desc: HeroDesc;
  fc: string;
}

export class HeroSet {
  private bodies: THREE.Mesh[] = [];
  private legs: THREE.InstancedMesh;
  private weapons = new Map<WeaponKind, { mesh: THREE.InstancedMesh; idx: number[] }>();
  private capes: THREE.InstancedMesh;
  private rest = 0.3;

  constructor(
    scene: THREE.Object3D,
    private list: HeroEntry[],
    shadow: boolean,
  ) {
    const { toy } = kitMaterials();
    const n = Math.max(1, list.length);
    this.legs = new THREE.InstancedMesh(horseLegGeo(), toy, n * 4);
    this.legs.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(n * 4 * 3).fill(1), 3);
    this.capes = new THREE.InstancedMesh(capeGeo(), new THREE.MeshStandardMaterial({ roughness: 0.8, side: THREE.DoubleSide }), n);
    this.capes.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(n * 3).fill(1), 3);
    const c = new THREE.Color();
    list.forEach((h, i) => {
      const body = new THREE.Mesh(heroBodyGeo(h.desc, h.fc), toy);
      body.castShadow = shadow;
      body.matrixAutoUpdate = false;
      scene.add(body);
      this.bodies.push(body);
      for (let k = 0; k < 4; k++) this.legs.setColorAt(i * 4 + k, c.set(h.desc.horse));
      this.capes.setColorAt(i, c.set(h.desc.cape));
      let w = this.weapons.get(h.desc.weapon);
      if (!w) {
        w = { mesh: new THREE.InstancedMesh(weaponGeo(h.desc.weapon), toy, n), idx: [] };
        w.mesh.castShadow = shadow;
        w.mesh.frustumCulled = false;
        scene.add(w.mesh);
        this.weapons.set(h.desc.weapon, w);
      }
      w.idx.push(i);
    });
    for (const m of [this.legs, this.capes]) {
      m.castShadow = shadow;
      m.frustumCulled = false;
      scene.add(m);
    }
  }

  /** 매 프레임: 장수 상태 → 행렬 */
  sync(t: number, hidden: (i: number) => boolean): void {
    const wSlot = new Map<WeaponKind, number>();
    this.list.forEach((h, i) => {
      const s = h.state;
      const body = this.bodies[i]!;
      const hide = s.gone || hidden(i);
      const wk = h.desc.weapon;
      const wi = wSlot.get(wk) ?? 0;
      wSlot.set(wk, wi + 1);
      const wm = this.weapons.get(wk)!.mesh;
      if (hide) {
        body.visible = false;
        for (let k = 0; k < 4; k++) this.legs.setMatrixAt(i * 4 + k, ZERO);
        this.capes.setMatrixAt(i, ZERO);
        wm.setMatrixAt(wi, ZERO);
        return;
      }
      body.visible = true;
      const mv = s.move;
      // 뿌리: 위치·방향·크기
      _E.set(0, s.yaw, 0);
      _Q.setFromEuler(_E);
      const root = new THREE.Matrix4().compose(_V.set(s.x, s.y, s.z), _Q, _S.setScalar(HERO_SCALE));
      // 몸통: 걸음에 따라 흔들림
      _E.set(Math.sin(s.walk * 2) * 0.04 * mv + 0.05 * mv, 0, 0);
      _Q.setFromEuler(_E);
      _L.compose(_V.set(0, Math.abs(Math.sin(s.walk)) * 0.1 * mv + Math.sin(t * 2) * 0.01, 0), _Q, ONE);
      _B.multiplyMatrices(root, _L);
      body.matrix.copy(_B);
      body.matrixWorldNeedsUpdate = true;
      // 말 다리 (hip_L/hip_R)
      for (let k = 0; k < 4; k++) {
        const p = HLEG[k]!;
        _E.set(Math.sin(s.walk + HPH[k]!) * 0.9 * mv, 0, 0);
        _Q.setFromEuler(_E);
        _L.compose(_V.set(p[0], p[1], p[2]), _Q, ONE);
        this.legs.setMatrixAt(i * 4 + k, _M.multiplyMatrices(_B, _L));
      }
      // 무기 (arm_R): 쉬는 자세 → 내려치기
      let rx = this.rest;
      let ry = 0;
      if (s.atk >= 0) {
        const a = s.atk;
        if (a < 0.35) {
          rx = lerp(this.rest, -1.7, ease(a / 0.35));
          ry = lerp(0, 0.9, a / 0.35);
        } else {
          const b = Math.min(1, (a - 0.35) / 0.35);
          rx = lerp(-1.7, 1.5, ease(b));
          ry = lerp(0.9, -0.8, ease(b));
        }
      }
      _E.set(rx, ry, 0);
      _Q.setFromEuler(_E);
      _L.compose(_V.set(0.24, 0.75 + 0.42, 0.07), _Q, ONE);
      wm.setMatrixAt(wi, _M.multiplyMatrices(_B, _L));
      // 망토: 달릴수록 뒤로 날린다
      _E.set(0.25 + mv * 0.7 + Math.sin(t * 7 + i) * 0.06 * (0.3 + mv), 0, 0);
      _Q.setFromEuler(_E);
      _L.compose(_V.set(0, 0.75 + 0.62, -0.21), _Q, ONE);
      this.capes.setMatrixAt(i, _M.multiplyMatrices(_B, _L));
    });
    this.legs.count = this.list.length * 4;
    this.capes.count = this.list.length;
    this.legs.instanceMatrix.needsUpdate = true;
    this.capes.instanceMatrix.needsUpdate = true;
    for (const [k, w] of this.weapons) {
      w.mesh.count = wSlot.get(k) ?? 0;
      w.mesh.instanceMatrix.needsUpdate = true;
    }
  }

  dispose(): void {
    for (const b of this.bodies) b.geometry.dispose();
    this.legs.dispose();
    this.capes.dispose();
    for (const w of this.weapons.values()) w.mesh.dispose();
  }
}

// ── 3D 모형으로 초상 찍기 (칩·컷인용, 얼굴이 모형과 똑같다) ──
let shot: { r: THREE.WebGLRenderer; scene: THREE.Scene; cam: THREE.PerspectiveCamera } | null = null;
const portraitCache = new Map<string, string>();

export function heroPortrait(key: string, desc: HeroDesc, fc: string): string {
  const hit = portraitCache.get(key);
  if (hit) return hit;
  if (!shot) {
    const canvas = document.createElement('canvas');
    const r = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
    r.setPixelRatio(1);
    r.setSize(200, 200, false);
    r.setClearColor(0x000000, 0);
    r.toneMapping = THREE.ACESFilmicToneMapping;
    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xfff4e6, 0x5a4a3a, 1.5));
    const dl = new THREE.DirectionalLight(0xffffff, 2.4);
    dl.position.set(-2, 3, 4);
    const rim = new THREE.DirectionalLight(0xffd9a0, 1.8);
    rim.position.set(3, 2, -3);
    scene.add(dl, rim);
    shot = { r, scene, cam: new THREE.PerspectiveCamera(26, 1, 0.1, 50) };
  }
  const g = new THREE.Group();
  const body = new THREE.Mesh(heroBodyGeo(desc, fc), kitMaterials().toy);
  const wp = new THREE.Mesh(weaponGeo(desc.weapon), kitMaterials().toy);
  wp.position.set(0.24, 0.75 + 0.42, 0.07);
  wp.rotation.x = 0.3;
  // 칩은 얼굴이 보여야 하므로 무기는 빼고 찍는다
  void wp;
  g.add(body);
  g.scale.setScalar(HERO_SCALE);
  g.rotation.y = -0.35;
  shot.scene.add(g);
  const hy = (0.75 + 0.86 + 0.04) * HERO_SCALE;
  const far = desc.hat === 'feather' ? 3.0 : 2.35;
  shot.cam.position.set(0.45, hy + 0.22, far);
  shot.cam.lookAt(0, hy + (desc.hat === 'feather' ? 0.12 : -0.02), 0);
  shot.r.render(shot.scene, shot.cam);
  const url = shot.r.domElement.toDataURL('image/png');
  shot.scene.remove(g);
  body.geometry.dispose();
  wp.geometry.dispose();
  portraitCache.set(key, url);
  return url;
}
