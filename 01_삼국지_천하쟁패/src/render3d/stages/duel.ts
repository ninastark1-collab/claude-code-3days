/**
 * 일기토 전용 무대 (디자인 수정 2, 시안 DuelStage):
 * 원형 흙마당, 양쪽에 양군 병사·깃발이 둘러서고, 두 장수가 말을 타고 양쪽 끝에서 들어온다.
 * 합은 엇갈리기(스치며 베기, 0.3초 슬로모션)와 맞붙기(4번 주고받기)를 번갈아. 결판에 진 장수는 말에서 떨어지고 이긴 장수는 무기를 치켜든다.
 * 승패·합마다 피해는 대본(엔진 일기토 결과를 나눈 것)을 그대로 재생한다.
 */
import * as THREE from 'three';
import { FX } from '../battle/fx';
import { InstancedKit } from '../battle/kit';
import { ease, fbm, lerp, mixC, seeded, smooth, type RGB } from '../math';
import { capeGeo, HERO_SCALE, HLEG, horseLegGeo, mountGeo, riderOnlyGeo, weaponGeo, type HeroDesc } from '../models/hero';
import { box, COL, cyl, kitMaterials, merge, part } from '../models/kit';
import { buildFoliage, buildGround } from '../terrain';
import type { Stage, World3D } from '../world';

/** 일기토 대본: 엔진 결과를 합 단위로 나눈 것 (UI 가 만든다) */
export interface DuelBeat {
  kind: 'pass' | 'lock';
  /** pass: 한 번 / lock: 네 번 (A,B,A,B 순서) */
  hits: { by: 'a' | 'b'; dmg: number; blocked: boolean; clash?: boolean }[];
}
export interface DuelScript {
  a: { desc: HeroDesc; fc: string; ch: string };
  b: { desc: HeroDesc; fc: string; ch: string };
  beats: DuelBeat[];
  /** 진 쪽 (무승부면 null) */
  loser: 'a' | 'b' | null;
}
export interface DuelHooks {
  round(i: number): void;
  say(text: string, cls?: 'hit' | 'win' | ''): void;
  hp(a: number, b: number): void;
  float(text: string, side: 'a' | 'b'): void;
  end(): void;
}

const hDuel = (x: number, z: number) => {
  const r = Math.hypot(x, z * 1.3);
  return 0.4 + (fbm(x * 0.04, z * 0.04, 3) - 0.5) * 0.6 + smooth(26, 60, r) * (3 + fbm(x * 0.06 + 2, z * 0.06, 3) * 10);
};
const SAND: RGB = [0.72, 0.6, 0.42];
const GRASS: RGB = [0.48, 0.63, 0.29];
const duelColor = (x: number, y: number, z: number, ny: number, c: THREE.Color) => {
  const r = Math.hypot(x, z * 1.3);
  let col = mixC(SAND, GRASS, smooth(11, 16, r));
  col = mixC(col, [0.62, 0.5, 0.34], fbm(x * 0.3, z * 0.3, 2) * 0.3 * (1 - smooth(11, 16, r)));
  col = mixC(col, [0.53, 0.51, 0.46], smooth(0.86, 0.7, ny));
  col = mixC(col, [0.4, 0.5, 0.3], smooth(4, 10, y) * 0.4);
  c.setRGB(col[0], col[1], col[2], THREE.SRGBColorSpace);
};

const flagTex = (ch: string, color: string) => {
  const cv = document.createElement('canvas');
  cv.width = 128;
  cv.height = 160;
  const g = cv.getContext('2d')!;
  g.fillStyle = color;
  g.fillRect(0, 0, 128, 160);
  g.strokeStyle = 'rgba(255,240,200,.8)';
  g.lineWidth = 4;
  g.strokeRect(10, 16, 98, 132);
  const c = new THREE.Color(color);
  g.fillStyle = 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b > 0.28 ? '#1B1F1D' : '#FFF7E6';
  g.font = '900 76px "Noto Serif KR", serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(ch, 59, 86);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
};

interface Rider {
  root: THREE.Group;
  body: THREE.Group;
  legs: THREE.Group[];
  rider: THREE.Group;
  wp: THREE.Group;
  cape: THREE.Mesh;
  x: number;
  z: number;
  vx: number;
  vz: number;
  yaw: number;
  walk: number;
  move: number;
  atk: number;
  rest: number;
  hp: number;
  side: 0 | 1;
}

const HPH = [0, Math.PI * 0.5, Math.PI, Math.PI * 1.5];
const lerpAng = (a: number, b: number, t: number) => {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
};

export class DuelStage implements Stage {
  tilt = { band: 0.12, amt: 5 };
  private w!: World3D;
  private fx!: FX;
  private A!: Rider;
  private B!: Rider;
  private crowd: { s: import('../battle/kit').PoseState; seed: number }[] = [];
  private kits: InstancedKit[] = [];
  private flags: THREE.Mesh[] = [];
  private t = 0;
  private time = 1;
  private slowT = 0;
  private beatI = -1;
  private beat: { k: 'intro' | 'pass' | 'lock' | 'finish'; t: number; done: Set<string>; sA?: number } | null = null;
  private over = false;
  private cheer = 0.6;

  constructor(
    private script: DuelScript,
    private hooks: DuelHooks,
  ) {}

  build(w: World3D): void {
    this.w = w;
    const sc = w.scene;
    sc.add(buildGround(w.U, 200, 150, 120, 90, hDuel, duelColor, 'duel'));
    sc.add(
      buildFoliage(w.U, hDuel, {
        trees: 140,
        pines: 0.4,
        tufts: 700,
        flowers: 120,
        rocks: 30,
        treeOk: (x, z) => Math.hypot(x, z * 1.3) > 24,
        tuftOk: (x, z) => Math.hypot(x, z * 1.3) > 15,
      }),
    );
    this.fx = new FX(sc, 1200);
    // 둘러선 양군 병사와 깃발
    const rnd = seeded(41);
    ([0, 1] as const).forEach((side) => {
      const fc = new THREE.Color(side ? this.script.b.fc : this.script.a.fc);
      const kit = new InstancedKit(sc, 'spear', 40, w.quality !== 'saver');
      this.kits.push(kit);
      const sgn = side ? 1 : -1;
      for (let i = 0; i < 34; i++) {
        const a = (i / 33 - 0.5) * 2.3;
        const r = 15 + (i % 2) * 1.3;
        const x = sgn * Math.cos(a) * r;
        const z = Math.sin(a) * r * 0.8;
        const s = {
          x,
          y: hDuel(x, z),
          z,
          yaw: Math.atan2(-x, -z),
          walk: rnd(0, 6),
          move: 0,
          bob: 0,
          lean: 0,
          atk: -1,
          pose: 'up' as const,
          aimV: 0,
          dead: false,
          fall: 0,
          fallSign: 1,
          hide: false,
          scale: 1.15,
          fc,
          coat: new THREE.Color('#7A5236'),
        };
        kit.add(s);
        this.crowd.push({ s, seed: rnd() });
      }
      const tex = flagTex(side ? this.script.b.ch : this.script.a.ch, side ? this.script.b.fc : this.script.a.fc);
      for (const a of [-0.8, 0, 0.8]) {
        const x = sgn * Math.cos(a) * 18.5;
        const z = Math.sin(a) * 18.5 * 0.8;
        const pole = new THREE.Mesh(cyl(0.045, 0.055, 4.5, 6), new THREE.MeshStandardMaterial({ color: '#6B4A2B' }));
        pole.position.set(x, hDuel(x, z) + 2.25, z);
        const fg = new THREE.PlaneGeometry(1.5, 1.8, 6, 2);
        fg.translate(0.75, 0, 0);
        const flag = new THREE.Mesh(fg, new THREE.MeshStandardMaterial({ map: tex, side: THREE.DoubleSide, roughness: 0.85 }));
        flag.position.set(x, hDuel(x, z) + 3.5, z);
        flag.rotation.y = 0.5;
        flag.userData.base = (fg.attributes.position!.array as Float32Array).slice();
        sc.add(pole, flag);
        this.flags.push(flag);
      }
    });
    this.A = this.rider(this.script.a.desc, this.script.a.fc, 0);
    this.B = this.rider(this.script.b.desc, this.script.b.fc, 1);
    this.A.x = -22;
    this.B.x = 22;
    const cam = w.cam;
    cam.speed = 4;
    cam.minD = 6;
    cam.maxD = 40;
    cam.bounds = [-20, 20, -15, 15];
    cam.set(0, 1.5, 0, 0, 0.32, 30, true);
    cam.set(0, 1.5, 0, 0.1, 0.22, 19);
    cam.lock = true;
    w.env.fogNear = 45;
    w.env.fogFar = 160;
    this.hooks.hp(100, 100);
    this.beat = { k: 'intro', t: 0, done: new Set() };
  }

  private rider(d: HeroDesc, fc: string, side: 0 | 1): Rider {
    const { toy } = kitMaterials();
    const mk = (g: THREE.BufferGeometry) => {
      const m = new THREE.Mesh(g, toy);
      m.castShadow = true;
      return m;
    };
    const root = new THREE.Group();
    const body = new THREE.Group();
    root.add(body);
    body.add(mk(mountGeo(d, fc)));
    const legGeo = horseLegGeo();
    const legs = HLEG.map((p) => {
      const g = new THREE.Group();
      g.position.set(...p);
      const m = mk(legGeo);
      // 다리는 흰 바탕 → 말털색 (인스턴스 색 대신 재질 색)
      m.material = new THREE.MeshStandardMaterial({ vertexColors: true, color: d.horse, roughness: 0.58 });
      g.add(m);
      body.add(g);
      return g;
    });
    const rider = new THREE.Group();
    rider.position.y = 0.75;
    body.add(rider);
    rider.add(mk(riderOnlyGeo(d)));
    const wp = new THREE.Group();
    wp.position.set(0.24, 0.42, 0.07);
    rider.add(wp);
    wp.add(mk(weaponGeo(d.weapon, d.skin)));
    const cape = new THREE.Mesh(capeGeo(), new THREE.MeshStandardMaterial({ color: d.cape, roughness: 0.8, side: THREE.DoubleSide }));
    cape.position.set(0, 0.62, -0.21);
    rider.add(cape);
    root.scale.setScalar(HERO_SCALE);
    this.w.scene.add(root);
    return { root, body, legs, rider, wp, cape, x: 0, z: 0, vx: 0, vz: 0, yaw: side ? -Math.PI / 2 : Math.PI / 2, walk: 0, move: 0, atk: -1, rest: 0.3, hp: 100, side };
  }

  private go(h: Rider, x: number, z: number, sp: number, dt: number) {
    const dx = x - h.x;
    const dz = z - h.z;
    const d = Math.hypot(dx, dz);
    const v = Math.min(sp, d * 4);
    h.vx = d > 0.05 ? (dx / d) * v : 0;
    h.vz = d > 0.05 ? (dz / d) * v : 0;
    h.x += h.vx * dt;
    h.z += h.vz * dt;
  }
  private face(h: Rider, x: number, z: number, dt: number) {
    h.yaw = lerpAng(h.yaw, Math.atan2(x - h.x, z - h.z), Math.min(1, dt * 8));
  }

  /** 맞는 순간: 큰 불꽃·흙먼지·흔들림, 엇갈리기는 0.3초 슬로모션 */
  private impact(big: boolean, hit: DuelBeat['hits'][number]) {
    const x = (this.A.x + this.B.x) / 2;
    const z = (this.A.z + this.B.z) / 2;
    const y = hDuel(x, z) + 2.6;
    const att = hit.by === 'a' ? this.A : this.B;
    const def = hit.by === 'a' ? this.B : this.A;
    const an = hit.by === 'a' ? this.script.a.desc : this.script.b.desc;
    void an;
    const nameA = hit.by === 'a' ? this.names.a : this.names.b;
    const nameD = hit.by === 'a' ? this.names.b : this.names.a;
    if (hit.clash) {
      this.fx.spark(x, y, z, 14, true);
      this.w.cam.shake = 0.2;
      this.hooks.say('챙! 칼날이 맞부딪친다');
    } else {
      this.fx.spark(x, y, z, big ? 34 : 18, true);
      this.fx.burst(x, y - 2.4, z, big ? 20 : 8, 0.6);
      this.w.cam.shake = big ? 0.5 : 0.28;
      if (big) {
        this.time = 0.22;
        this.slowT = 0.32;
      }
      def.hp = Math.max(0, def.hp - hit.dmg);
      if (hit.blocked) this.hooks.say(`${nameD}${this.josaIGa(nameD)} 막아냈다!`);
      else {
        this.hooks.say(`${nameA}의 일격! ${nameD} −${hit.dmg}`, 'hit');
        this.hooks.float(`-${hit.dmg}`, def === this.A ? 'a' : 'b');
      }
      this.hooks.hp(this.A.hp, this.B.hp);
      def.body.rotation.z = (def.side ? 1 : -1) * 0.18;
      this.cheer = 1.6;
    }
    void att;
  }

  names = { a: '', b: '' };
  private josaIGa(n: string) {
    const c = n.charCodeAt(n.length - 1);
    return c >= 0xac00 && c <= 0xd7a3 && (c - 0xac00) % 28 ? '이' : '가';
  }

  /** 건너뛰기: 남은 합의 피해를 한 번에 반영하고 결판으로 */
  skip(): void {
    if (this.over) return;
    for (let i = Math.max(0, this.beatI + (this.beat && this.beat.k !== 'intro' ? 1 : 0)); i < this.script.beats.length; i++)
      for (const h of this.script.beats[i]!.hits) if (!h.clash) (h.by === 'a' ? this.B : this.A).hp = Math.max(0, (h.by === 'a' ? this.B : this.A).hp - h.dmg);
    this.hooks.hp(this.A.hp, this.B.hp);
    this.beatI = this.script.beats.length;
    this.beat = { k: 'finish', t: 0, done: new Set() };
  }

  update(rdt: number): void {
    if (this.slowT > 0 && (this.slowT -= rdt) <= 0) this.time = 1;
    const dt = rdt * this.time;
    this.t += dt;
    const A = this.A;
    const B = this.B;
    const cam = this.w.cam;
    if (!this.beat) {
      this.beatI++;
      const nb = this.script.beats[this.beatI];
      if (!nb) this.beat = { k: 'finish', t: 0, done: new Set() };
      else {
        this.beat = { k: nb.kind, t: 0, done: new Set(), sA: Math.sign(A.x) || -1 };
        this.hooks.round(this.beatI);
        this.hooks.say('');
      }
    }
    const b = this.beat!;
    b.t += dt;
    const once = (k: string) => (b.done.has(k) ? false : (b.done.add(k), true));
    if (b.k === 'intro') {
      this.go(A, -9, 0, 7, dt);
      this.go(B, 9, 0, 7, dt);
      this.face(A, B.x, 0, dt);
      this.face(B, A.x, 0, dt);
      cam.T.set(0, 1.5, 0);
      if (b.t > 2.2) this.beat = null;
    } else if (b.k === 'pass') {
      // 엇갈리기: 옆에서 낮게
      const s = b.sA!;
      const u = Math.min(1, b.t / 2.0);
      const ax = lerp(9 * s, -9 * s, u);
      A.vx = (-18 * s) / 2;
      B.vx = -A.vx;
      A.vz = B.vz = 0;
      A.x = ax;
      B.x = -ax;
      A.z = -0.85 * s;
      B.z = 0.85 * s;
      if (u < 1) {
        A.yaw = lerpAng(A.yaw, Math.atan2(-s, 0), dt * 10);
        B.yaw = lerpAng(B.yaw, Math.atan2(s, 0), dt * 10);
      }
      if (b.t > 0.62 && once('sw')) A.atk = B.atk = 0;
      if (b.t > 1.0 && once('hit')) {
        const hs = this.script.beats[this.beatI]!.hits;
        this.impact(true, hs[0]!);
        // 같은 합에서 상대도 입은 피해 (엔진 체력과 맞추기)
        const h2 = hs[1];
        if (h2 && h2.dmg > 0) {
          const d = h2.by === 'a' ? B : A;
          d.hp = Math.max(0, d.hp - h2.dmg);
          this.hooks.hp(A.hp, B.hp);
        }
      }
      if (Math.random() < dt * 14) {
        this.fx.dustAt(A.x, 0, A.z, 1.4);
        this.fx.dustAt(B.x, 0, B.z, 1.4);
      }
      cam.T.set(0, 1.6, 0);
      cam.Y = 0.02;
      cam.Pp = 0.16;
      cam.D = b.t > 0.7 && b.t < 1.3 ? 11 : 17;
      if (b.t > 2.6) {
        A.yaw = Math.atan2(B.x - A.x, 0);
        B.yaw = Math.atan2(A.x - B.x, 0);
        this.beat = null;
      }
    } else if (b.k === 'lock') {
      // 맞붙기: 가까이 비스듬히, 네 번 주고받기
      const sa = Math.sign(A.x - B.x) || -1;
      this.go(A, sa * 1.2, 0, 9, dt);
      this.go(B, -sa * 1.2, 0, 9, dt);
      if (b.t > 2.6) {
        this.go(A, sa * 8, 0, 6, dt);
        this.go(B, -sa * 8, 0, 6, dt);
      }
      this.face(A, B.x, B.z, dt);
      this.face(B, A.x, A.z, dt);
      const hits = this.script.beats[this.beatI]!.hits;
      [0.9, 1.35, 1.8, 2.2].forEach((tt, i) => {
        const h = hits[i];
        if (!h) return;
        const att = h.by === 'a' ? A : B;
        if (b.t > tt - 0.25 && once('s' + i)) att.atk = 0;
        if (b.t > tt && once('h' + i)) this.impact(false, h);
      });
      cam.T.set(0, 2, 0);
      cam.Y = 0.32;
      cam.Pp = 0.2;
      cam.D = 9;
      if (b.t > 3.4) this.beat = null;
    } else {
      // 결판: 진 장수는 말에서 떨어지고, 이긴 장수는 무기를 치켜들고 말이 앞발을 든다
      const L = this.script.loser === 'a' ? A : this.script.loser === 'b' ? B : null;
      const Wn = L === A ? B : L === B ? A : null;
      if (once('said')) {
        if (L && Wn) {
          const wn = Wn === A ? this.names.a : this.names.b;
          const ln = L === A ? this.names.a : this.names.b;
          this.hooks.say(`${wn} 승리! ${ln}${this.josaIGa(ln)} 말에서 떨어졌다`, 'win');
          this.fx.burst(L.x, hDuel(L.x, 0), 0, 24, 0.8);
          cam.shake = 0.35;
        } else this.hooks.say('승부가 나지 않았다. 두 장수가 말머리를 돌린다', 'win');
        this.cheer = 1.6;
      }
      if (L && Wn) {
        const k = ease(Math.min(1, b.t / 0.7));
        L.rider.rotation.z = (L.side ? 1 : -1) * 1.5 * k;
        L.rider.position.y = 0.75 - 0.9 * k;
        L.rider.position.x = (L.side ? -1 : 1) * 0.5 * k;
        L.vx = L.vz = 0;
        Wn.vx = Wn.vz = 0;
        Wn.atk = -1;
        Wn.rest = lerp(Wn.rest, -2.3, Math.min(1, dt * 4));
        Wn.body.rotation.x = -0.35 * Math.sin(Math.min(Math.PI, b.t * 2.5));
        cam.T.set(Wn.x * 1.6, 2, 0);
        cam.Y = 0.4;
        cam.Pp = 0.24;
        cam.D = 10;
      } else {
        this.go(A, -12, 0, 4, dt);
        this.go(B, 12, 0, 4, dt);
      }
      if (b.t > 2.8 && !this.over) {
        this.over = true;
        this.hooks.end();
      }
    }
    for (const h of [A, B]) {
      if (h.atk >= 0) {
        h.atk += dt * 2.2;
        if (h.atk >= 1) h.atk = -1;
      }
      h.body.rotation.z *= Math.exp(-dt * 6);
      this.anim(h, dt);
    }
    this.cheer = lerp(this.cheer, 0.6, Math.min(1, dt));
    for (const c of this.crowd) {
      c.s.bob = Math.max(0, Math.sin(this.t * (4 + c.seed * 3) + c.seed * 9)) * 0.18 * this.cheer;
      c.s.walk += dt * 3;
    }
    for (const k of this.kits) k.sync();
    for (const f of this.flags) {
      const g = f.geometry.attributes.position!;
      const base = f.userData.base as Float32Array;
      for (let i = 0; i < g.count; i++) {
        const x = base[i * 3]!;
        g.setZ(i, Math.sin(this.t * 5.2 - x * 3.4) * 0.17 * (x / 1.5));
      }
      g.needsUpdate = true;
    }
    this.fx.update(dt);
  }

  private anim(h: Rider, dt: number) {
    const v = Math.hypot(h.vx, h.vz);
    h.move = lerp(h.move, Math.min(1, v / 4), Math.min(1, dt * 6));
    const mv = h.move;
    h.walk += dt * (1 + v * 2.4);
    h.body.position.y = Math.abs(Math.sin(h.walk)) * 0.1 * mv;
    if (Math.abs(h.body.rotation.x) < 0.01) h.body.rotation.x = Math.sin(h.walk * 2) * 0.04 * mv + 0.05 * mv;
    h.legs.forEach((g, k) => (g.rotation.x = Math.sin(h.walk + HPH[k]!) * 0.9 * mv));
    let rx = h.rest;
    let ry = 0;
    if (h.atk >= 0) {
      const a = h.atk;
      if (a < 0.35) {
        rx = lerp(h.rest, -1.7, ease(a / 0.35));
        ry = lerp(0, 0.9, a / 0.35);
      } else {
        const bb = Math.min(1, (a - 0.35) / 0.35);
        rx = lerp(-1.7, 1.5, ease(bb));
        ry = lerp(0.9, -0.8, ease(bb));
      }
    }
    h.wp.rotation.set(rx, ry, 0);
    h.cape.rotation.x = 0.25 + mv * 0.7;
    h.root.position.set(h.x, hDuel(h.x, h.z), h.z);
    h.root.rotation.y = h.yaw;
  }
}

/** 합 대본 만들기: 엔진 일기토 기록(라운드별 체력)을 최대 beats 개의 합으로 나눈다 (최종 승패·체력은 엔진 값 그대로) */
export function scriptFromRounds(rounds: { aHp: number; bHp: number }[], maxBeats = 4): DuelBeat[] {
  const n = rounds.length;
  const beats = Math.max(2, Math.min(maxBeats, Math.round(n / 3)));
  const marks: number[] = [];
  for (let i = 1; i <= beats; i++) marks.push(Math.max(0, Math.round((n * i) / beats) - 1));
  const out: DuelBeat[] = [];
  let pa = 100;
  let pb = 100;
  marks.forEach((m, i) => {
    const r = rounds[m] ?? { aHp: pa, bHp: pb };
    const dA = Math.max(0, pa - Math.max(0, r.aHp));
    const dB = Math.max(0, pb - Math.max(0, r.bHp));
    pa = Math.max(0, r.aHp);
    pb = Math.max(0, r.bHp);
    if (i % 2 === 0) {
      // 엇갈리기: 한 번에 두 장수 피해를 모두 (큰 쪽을 보여 주는 일격으로)
      const aHitsB = dB >= dA;
      out.push({ kind: 'pass', hits: [{ by: aHitsB ? 'a' : 'b', dmg: aHitsB ? dB : dA, blocked: (aHitsB ? dB : dA) < 3 }] });
      // 작은 쪽 피해는 같은 합의 숨은 피해로 (체력이 엔진과 맞도록)
      if ((aHitsB ? dA : dB) > 0) out[out.length - 1]!.hits.push({ by: aHitsB ? 'b' : 'a', dmg: aHitsB ? dA : dB, blocked: false, clash: false });
    } else {
      const half = (d: number) => [Math.ceil(d / 2), Math.floor(d / 2)];
      const [a1, a2] = half(dB);
      const [b1, b2] = half(dA);
      out.push({
        kind: 'lock',
        hits: [
          { by: 'a', dmg: a1!, blocked: a1! < 2, clash: a1! === 0 },
          { by: 'b', dmg: b1!, blocked: b1! < 2, clash: b1! === 0 },
          { by: 'a', dmg: a2!, blocked: a2! < 2, clash: a2! === 0 },
          { by: 'b', dmg: b2!, blocked: b2! < 2, clash: b2! === 0 },
        ],
      });
    }
  });
  return out;
}

void box;
void COL;
void merge;
void part;
