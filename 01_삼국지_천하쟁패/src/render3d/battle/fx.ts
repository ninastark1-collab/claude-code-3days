/**
 * 효과: 먼지·불꽃·연기·불씨 입자(그리기 2회), 화살 420개(그리기 1회) — 시안 Particles·FX·Arrows
 */
import * as THREE from 'three';
import { lerp, seeded } from '../math';
import { box, COL, cone, cyl, kitMaterials, merge, part } from '../models/kit';

/** 점 크기 보정 (화면 높이·시야각에 따라 world 가 매 프레임 넣는다) */
export const PS_SCALE = { value: 500 };
const P_VS = `attribute float size; attribute vec4 color4; varying vec4 vC; uniform float uScale;
void main(){ vec4 mv=modelViewMatrix*vec4(position,1.); gl_Position=projectionMatrix*mv; gl_PointSize=min(size*uScale/max(-mv.z,.1),256.); vC=color4; }`;
const P_FS = `varying vec4 vC; void main(){ vec2 d=gl_PointCoord-.5; float r=length(d)*2.; if(r>1.) discard; float a=1.-r; a*=a; gl_FragColor=vec4(vC.rgb,vC.a*a); }`;

const rnd = seeded(99);
const R = (a: number, b: number) => rnd(a, b);

class Particles {
  n = 0;
  private p: Float32Array;
  private v: Float32Array;
  private c: Float32Array;
  private s: Float32Array;
  private life: Float32Array;
  private ml: Float32Array;
  private s0: Float32Array;
  private s1: Float32Array;
  private a0: Float32Array;
  private dr: Float32Array;
  private gr: Float32Array;
  private c0: Float32Array;
  private c1: Float32Array;
  private pa: THREE.BufferAttribute;
  private ca: THREE.BufferAttribute;
  private sa: THREE.BufferAttribute;
  readonly pts: THREE.Points;
  constructor(
    scene: THREE.Object3D,
    private max: number,
    additive: boolean,
  ) {
    const F = (k: number) => new Float32Array(max * k);
    this.p = F(3);
    this.v = F(3);
    this.c = F(4);
    this.s = F(1);
    this.life = F(1);
    this.ml = F(1);
    this.s0 = F(1);
    this.s1 = F(1);
    this.a0 = F(1);
    this.dr = F(1);
    this.gr = F(1);
    this.c0 = F(3);
    this.c1 = F(3);
    const g = new THREE.BufferGeometry();
    this.pa = new THREE.BufferAttribute(this.p, 3);
    this.ca = new THREE.BufferAttribute(this.c, 4);
    this.sa = new THREE.BufferAttribute(this.s, 1);
    for (const a of [this.pa, this.ca, this.sa]) a.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', this.pa);
    g.setAttribute('color4', this.ca);
    g.setAttribute('size', this.sa);
    const m = new THREE.ShaderMaterial({ uniforms: { uScale: PS_SCALE }, vertexShader: P_VS, fragmentShader: P_FS, transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending });
    this.pts = new THREE.Points(g, m);
    this.pts.frustumCulled = false;
    this.pts.renderOrder = additive ? 6 : 5;
    scene.add(this.pts);
  }
  // prettier-ignore
  emit(x: number, y: number, z: number, vx: number, vy: number, vz: number, life: number, s0: number, s1: number, r: number, g: number, b: number, a: number, dr = 1, gr = 0, r2 = r, g2 = g, b2 = b): void {
    if (this.n >= this.max) return;
    const i = this.n++;
    const i3 = i * 3;
    this.p[i3] = x; this.p[i3 + 1] = y; this.p[i3 + 2] = z;
    this.v[i3] = vx; this.v[i3 + 1] = vy; this.v[i3 + 2] = vz;
    this.life[i] = this.ml[i] = life; this.s0[i] = s0; this.s1[i] = s1; this.a0[i] = a; this.dr[i] = dr; this.gr[i] = gr;
    this.c0[i3] = r; this.c0[i3 + 1] = g; this.c0[i3 + 2] = b; this.c1[i3] = r2; this.c1[i3 + 1] = g2; this.c1[i3 + 2] = b2;
    this.s[i] = 0; this.c[i * 4 + 3] = 0;
  }
  private kill(i: number): void {
    const j = --this.n;
    if (i === j) return;
    const cp = (arr: Float32Array, k: number) => {
      for (let q = 0; q < k; q++) arr[i * k + q] = arr[j * k + q]!;
    };
    cp(this.p, 3);
    cp(this.v, 3);
    cp(this.c, 4);
    cp(this.s, 1);
    cp(this.life, 1);
    cp(this.ml, 1);
    cp(this.s0, 1);
    cp(this.s1, 1);
    cp(this.a0, 1);
    cp(this.dr, 1);
    cp(this.gr, 1);
    cp(this.c0, 3);
    cp(this.c1, 3);
  }
  update(dt: number): void {
    let i = 0;
    while (i < this.n) {
      this.life[i]! -= dt;
      if (this.life[i]! <= 0) {
        this.kill(i);
        continue;
      }
      const i3 = i * 3;
      const k = Math.max(0, 1 - this.dr[i]! * dt);
      this.v[i3]! *= k;
      this.v[i3 + 1] = this.v[i3 + 1]! * k - this.gr[i]! * dt;
      this.v[i3 + 2]! *= k;
      this.p[i3]! += this.v[i3]! * dt;
      this.p[i3 + 1]! += this.v[i3 + 1]! * dt;
      this.p[i3 + 2]! += this.v[i3 + 2]! * dt;
      const t = 1 - this.life[i]! / this.ml[i]!;
      this.s[i] = lerp(this.s0[i]!, this.s1[i]!, t);
      const f = t < 0.12 ? t / 0.12 : 1 - (t - 0.12) / 0.88;
      const i4 = i * 4;
      this.c[i4] = lerp(this.c0[i3]!, this.c1[i3]!, t);
      this.c[i4 + 1] = lerp(this.c0[i3 + 1]!, this.c1[i3 + 1]!, t);
      this.c[i4 + 2] = lerp(this.c0[i3 + 2]!, this.c1[i3 + 2]!, t);
      this.c[i4 + 3] = this.a0[i]! * f;
      i++;
    }
    this.pts.geometry.setDrawRange(0, this.n);
    this.pa.needsUpdate = this.ca.needsUpdate = this.sa.needsUpdate = true;
  }
  clear(): void {
    this.n = 0;
    this.pts.geometry.setDrawRange(0, 0);
  }
}

export class FX {
  readonly dust: Particles;
  readonly glow: Particles;
  constructor(scene: THREE.Object3D, max = 1800) {
    this.dust = new Particles(scene, max, false);
    this.glow = new Particles(scene, max, true);
  }
  /** 충돌 불꽃 (gold = 장수 일격) */
  spark(x: number, y: number, z: number, n = 6, gold = false): void {
    for (let i = 0; i < n; i++) {
      const a = R(0, 6.28);
      const sp = R(2, 5);
      this.glow.emit(x, y, z, Math.cos(a) * sp, R(1, 4), Math.sin(a) * sp, R(0.18, 0.34), gold ? 0.4 : 0.3, 0.04, gold ? 8 : 6, gold ? 5.5 : 3.6, gold ? 1.6 : 1.2, 1, 2, 9);
    }
    this.glow.emit(x, y, z, 0, 0, 0, 0.13, gold ? 2.4 : 1.4, 0.4, 6, 4.5, 2.5, 1, 0, 0);
  }
  poof(x: number, y: number, z: number): void {
    for (let i = 0; i < 5; i++) this.dust.emit(x + R(-0.2, 0.2), y, z + R(-0.2, 0.2), R(-0.6, 0.6), R(0.4, 1.2), R(-0.6, 0.6), R(0.5, 0.8), 0.5, 1.4, 0.9, 0.88, 0.82, 0.55, 2.2, 0);
  }
  /** 행군 먼지 */
  dustAt(x: number, y: number, z: number, big = 1): void {
    this.dust.emit(x + R(-0.2, 0.2), y + 0.1, z + R(-0.2, 0.2), R(-0.3, 0.3), R(0.2, 0.6), R(-0.3, 0.3), R(0.9, 1.5) * big, 0.5 * big, 1.9 * big, 0.62, 0.53, 0.4, 0.3, 1.4, 0);
  }
  /** 큰 먼지 폭발 (성문·투석) */
  burst(x: number, y: number, z: number, n = 30, s = 1): void {
    for (let i = 0; i < n; i++) this.dust.emit(x, y, z, R(-4, 4) * s, R(1, 5) * s, R(-4, 4) * s, R(1.2, 2.4), 1.2 * s, 4 * s, 0.6, 0.54, 0.44, 0.6, 1.8, 1.2);
    for (let i = 0; i < n / 2; i++) this.dust.emit(x, y, z, R(-5, 5), R(3, 8), R(-5, 5), R(0.8, 1.2), 0.22, 0.2, 0.25, 0.2, 0.15, 1, 0.3, 12);
  }
  /** 여울 물보라 */
  splash(x: number, y: number, z: number): void {
    for (let i = 0; i < 4; i++) this.dust.emit(x + R(-0.3, 0.3), y + 0.15, z + R(-0.3, 0.3), R(-0.8, 0.8), R(1.5, 3), R(-0.8, 0.8), R(0.4, 0.7), 0.25, 0.6, 0.86, 0.93, 0.98, 0.75, 0.6, 8);
  }
  flame(x: number, y: number, z: number, s = 1): void {
    this.glow.emit(x + R(-0.3, 0.3) * s, y, z + R(-0.3, 0.3) * s, R(-0.3, 0.3), R(1.8, 3.2) * s, R(-0.3, 0.3), R(0.5, 0.9), 1.1 * s, 0.25 * s, 7, 2.6, 0.5, 1, 1.2, -1, 3.5, 0.6, 0.1);
  }
  smoke(x: number, y: number, z: number, s = 1): void {
    this.dust.emit(x, y, z, R(-0.3, 0.3) + 0.4, R(1, 1.8), R(-0.3, 0.3), R(2.5, 4), 1.4 * s, 5 * s, 0.16, 0.15, 0.14, 0.5, 0.25, -0.1, 0.3, 0.29, 0.28);
  }
  ember(x: number, y: number, z: number): void {
    this.glow.emit(x, y, z, R(-1, 1), R(2.5, 5), R(-1, 1), R(1, 1.8), 0.14, 0.04, 8, 3, 0.6, 1, 0.4, -0.4);
  }
  update(dt: number): void {
    this.dust.update(dt);
    this.glow.update(dt);
  }
  clear(): void {
    this.dust.clear();
    this.glow.clear();
  }
}

const _V = new THREE.Vector3();
const _D = new THREE.Vector3();
const _T = new THREE.Vector3();
const _S = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

interface Arrow {
  a: THREE.Vector3;
  b: THREE.Vector3;
  t: number;
  T: number;
  Hh: number;
  stuck: number;
  fire: boolean;
  m: THREE.Matrix4;
  sc: number;
}

/** 화살: 포물선으로 날아가 땅에 2.6초 꽂힌다. 한 번의 그리기 */
export class Arrows {
  private mesh: THREE.InstancedMesh;
  private list: Arrow[] = [];
  constructor(
    scene: THREE.Object3D,
    private fx: FX,
    private max = 420,
  ) {
    const geo = merge(
      part(cyl(0.02, 0.02, 1.05, 3), '#9A7A50', [0, 0, 0], [Math.PI / 2, 0, 0]),
      part(cone(0.045, 0.14, 4), COL.STEEL, [0, 0, 0.58], [Math.PI / 2, 0, 0]),
      part(box(0.13, 0.006, 0.18), '#F4F0E6', [0, 0, -0.44]),
      part(box(0.006, 0.13, 0.18), '#F4F0E6', [0, 0, -0.44]),
    );
    this.mesh = new THREE.InstancedMesh(geo, kitMaterials().toy, max);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    scene.add(this.mesh);
  }
  fire(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, o: { fire?: boolean; H?: number } = {}): void {
    if (this.list.length >= this.max) return;
    const d = Math.hypot(x1 - x0, z1 - z0);
    this.list.push({ a: new THREE.Vector3(x0, y0, z0), b: new THREE.Vector3(x1, y1, z1), t: 0, T: 0.9 + d * 0.03, Hh: o.H ?? 1.5 + d * 0.22, stuck: 0, fire: !!o.fire, m: new THREE.Matrix4(), sc: 1.35 });
  }
  update(dt: number): void {
    const L = this.list;
    for (let i = L.length - 1; i >= 0; i--) {
      const r = L[i]!;
      if (r.stuck > 0) {
        r.stuck -= dt;
        if (r.stuck <= 0) L.splice(i, 1);
        continue;
      }
      r.t += dt;
      const u = Math.min(1, r.t / r.T);
      _V.lerpVectors(r.a, r.b, u);
      _V.y += 4 * r.Hh * u * (1 - u);
      _D.subVectors(r.b, r.a);
      _D.y += 4 * r.Hh * (1 - 2 * u);
      _D.normalize();
      _T.copy(_V).sub(_D);
      r.m.lookAt(_V, _T, UP);
      r.m.scale(_S.setScalar(r.sc));
      if (r.fire && rnd() < 0.85) this.fx.flame(_V.x, _V.y, _V.z, 0.4);
      if (u >= 1) {
        _V.addScaledVector(_D, -0.4);
        r.stuck = r.fire ? 1.2 : 2.6;
        if (rnd() < 0.3) this.fx.dustAt(r.b.x, r.b.y, r.b.z, 0.5);
      }
      r.m.setPosition(_V);
    }
    for (let i = 0; i < L.length; i++) this.mesh.setMatrixAt(i, L[i]!.m);
    this.mesh.count = L.length;
    this.mesh.instanceMatrix.needsUpdate = true;
  }
  clear(): void {
    this.list.length = 0;
    this.mesh.count = 0;
  }
}
