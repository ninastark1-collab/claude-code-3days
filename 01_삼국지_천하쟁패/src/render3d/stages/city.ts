/**
 * 내정 3D 도시 (설계서: 명령을 내리면 결과가 도시에서 바로 벌어진다).
 * 성 안: 관청·시장·병영·대장간·기와집, 서문 밖 논밭. 백성이 오가고, 병사가 훈련하고, 굴뚝에서 연기가 난다.
 * 수치는 엔진 값이고 이 장면은 "벌어지는 일"만 보여 준다.
 */
import * as THREE from 'three';
import { FX } from '../battle/fx';
import { InstancedKit } from '../battle/kit';
import { clamp, fbm, lerp, mixC, seeded, smooth, type RGB } from '../math';
import { doorGeo, gateTowerGeo, houseGeo, keepGeo, WALL_H, wallGeo } from '../models/castle';
import { box, COL, cone, cyl, kitMaterials, merge, part } from '../models/kit';
import { buildFoliage, buildGround } from '../terrain';
import type { Stage, World3D } from '../world';

export type CityCmd = 'agriculture' | 'commerce' | 'order' | 'conscript' | 'train' | 'search';
export type Spot = 'field' | 'market' | 'yamen' | 'barracks' | 'smithy' | 'gate' | 'all';
/** 카메라 자리 [x, z, 거리] */
export const SPOTS: Record<Spot, [number, number, number]> = {
  field: [-47, 0, 34],
  market: [11, 9, 26],
  yamen: [0, -9, 28],
  barracks: [-11, 10, 26],
  smithy: [12, -10, 24],
  gate: [0, 22, 30],
  all: [-6, 0, 66],
};
export const CMD_SPOT: Record<CityCmd, Spot> = { agriculture: 'field', commerce: 'market', order: 'yamen', conscript: 'gate', train: 'barracks', search: 'gate' };

const CW = 24;
const FIELD = { x0: -64, x1: -30, z0: -22, z1: 22 };
const TUNIC = ['#E9E2D2', '#C9D8C5', '#D8C3A5', '#B7C7D8', '#E5C7C1', '#CFC1DB', '#A9B98F', '#DDBE8A'];

interface Person {
  x: number;
  y: number;
  z: number;
  vx: number;
  vz: number;
  yaw: number;
  walk: number;
  move: number;
  bob: number;
  lean: number;
  atk: number;
  pose: 'up' | 'low';
  aimV: number;
  dead: boolean;
  fall: number;
  fallSign: number;
  hide: boolean;
  scale: number;
  fc: THREE.Color;
  coat: THREE.Color;
  // 행동
  state: 'walk' | 'farm' | 'drill' | 'guard' | 'goto' | 'patrol';
  goal: [number, number];
  cd: number;
  pause: number;
  path?: [number, number][];
  pi?: number;
  /** goto 가 끝나면 바꿀 상태 */
  then?: Person['state'];
}

const hCity = (x: number, z: number) => {
  const inside = Math.max(Math.abs(x), Math.abs(z)) < CW + 1;
  if (inside) return 0.55;
  let h = 0.5 + (fbm(x * 0.03 + 3, z * 0.03 + 7, 3) - 0.5) * 0.8;
  const e = Math.max(smooth(70, 110, Math.abs(x)), smooth(40, 80, Math.abs(z)));
  h += e * (4 + fbm(x * 0.05, z * 0.05, 4) * 12);
  return h;
};
const PAVE: RGB = [0.66, 0.6, 0.5];
const GRASS: RGB = [0.48, 0.63, 0.29];
const SOIL: RGB = [0.5, 0.4, 0.27];
const colorCity = (x: number, y: number, z: number, ny: number, c: THREE.Color) => {
  let col: RGB = mixC(GRASS, [0.56, 0.67, 0.31], smooth(0.35, 0.65, fbm(x * 0.05 + 11, z * 0.05 + 3, 3)));
  if (Math.max(Math.abs(x), Math.abs(z)) < CW) col = mixC(PAVE, [0.6, 0.55, 0.45], fbm(x * 0.2, z * 0.2, 2) * 0.5);
  if (Math.abs(x) < 1.6 || Math.abs(z) < 1.6) col = mixC(col, [0.72, 0.66, 0.54], Math.max(Math.abs(x) < 1.6 ? 1 : 0, Math.abs(z) < 1.6 ? 1 : 0) * (Math.max(Math.abs(x), Math.abs(z)) < CW + 12 ? 0.8 : 0));
  if (x > FIELD.x0 && x < FIELD.x1 && z > FIELD.z0 && z < FIELD.z1) col = mixC(SOIL, [0.42, 0.34, 0.22], Math.abs(Math.sin(z * 1.2)) * 0.6);
  col = mixC(col, [0.53, 0.51, 0.46], smooth(0.86, 0.7, ny));
  col = mixC(col, [0.4, 0.5, 0.3], smooth(4, 10, y) * 0.4);
  c.setRGB(col[0], col[1], col[2], THREE.SRGBColorSpace);
};

export class CityStage implements Stage {
  tilt = { band: 0.2, amt: 4.5 };
  private world!: World3D;
  private fx!: FX;
  private civK!: InstancedKit;
  private farmK!: InstancedKit;
  private spearK!: InstancedKit;
  private people: Person[] = [];
  private crops!: THREE.InstancedMesh;
  private cropData: { x: number; y: number; z: number; s: number; ry: number }[] = [];
  private grow = 0.5;
  growT = 0.5;
  private stalls!: THREE.InstancedMesh;
  private stallN = 0;
  private stallMax = 12;
  drillRate = 1;
  private drillT = 0;
  private t = 0;
  private rnd = seeded(17);
  private WP: [number, number][] = [];
  private hits: { k: Spot; box: THREE.Box3 }[] = [];
  private ray = new THREE.Raycaster();
  private lamps!: THREE.InstancedMesh;

  constructor(
    private fc: string,
    /** 시작 상태 (엔진 값): 농업 비율 0~1, 시장 노점 수, 병영 병사 수 */
    private init: { agri: number; stalls: number; drill: number },
  ) {}

  build(w: World3D): void {
    this.world = w;
    const sc = w.scene;
    const { toy, flat } = kitMaterials();
    sc.add(buildGround(w.U, 240, 170, 150, 106, hCity, colorCity, 'city'));
    sc.add(
      buildFoliage(w.U, hCity, {
        trees: 220,
        pines: 0.4,
        tufts: w.quality === 'saver' ? 900 : 1800,
        flowers: 300,
        rocks: 40,
        treeOk: (x, z) => Math.max(Math.abs(x), Math.abs(z)) > CW + 8 && !(x > FIELD.x0 - 3 && x < FIELD.x1 + 3 && Math.abs(z) < FIELD.z1 + 3) && Math.abs(z) > 4,
        tuftOk: (x, z) => Math.max(Math.abs(x), Math.abs(z)) > CW + 3 && !(x > FIELD.x0 && x < FIELD.x1 && Math.abs(z) < FIELD.z1),
      }),
    );
    // 성벽 고리 (서문·남문)
    const walls: THREE.Matrix4[] = [];
    const q = new THREE.Quaternion();
    const Y = new THREE.Vector3(0, 1, 0);
    const put = (x: number, z: number, rot: number) => walls.push(new THREE.Matrix4().compose(new THREE.Vector3(x, 0.35, z), q.clone().setFromAxisAngle(Y, rot), new THREE.Vector3(1, 1, 1)));
    for (let i = -6; i <= 6; i++) {
      const v = i * 4;
      put(v, -CW, Math.PI / 2);
      put(CW, v, 0);
      if (i !== 0) put(v, CW, -Math.PI / 2);
      if (i !== 0) put(-CW, v, Math.PI);
    }
    const wm = new THREE.InstancedMesh(wallGeo(4), flat, walls.length);
    walls.forEach((m, i) => wm.setMatrixAt(i, m));
    wm.castShadow = wm.receiveShadow = true;
    sc.add(wm);
    for (const [x, z, rot] of [
      [0, CW, -Math.PI / 2],
      [-CW, 0, Math.PI],
    ] as const) {
      const g = new THREE.Group();
      g.position.set(x, 0.35, z);
      g.rotation.y = rot;
      const t = new THREE.Mesh(gateTowerGeo(4), toy);
      t.castShadow = true;
      g.add(t);
      for (const s of [-1, 1]) {
        const d = new THREE.Mesh(doorGeo(4), toy);
        d.position.set(0.7, 0, s * 1.04);
        d.rotation.y = (s > 0 ? Math.PI : 0) + s * 1.3;
        g.add(d);
      }
      sc.add(g);
    }
    // 관청
    const yamen = new THREE.Mesh(keepGeo(), toy);
    yamen.position.set(0, 0.55, -10);
    yamen.scale.setScalar(1.6);
    yamen.castShadow = yamen.receiveShadow = true;
    sc.add(yamen);
    // 병영 (긴 건물 + 마당)
    const bar = new THREE.Mesh(merge(part(box(10, 1.6, 3), '#E2D6C2', [0, 0.8, 0]), part(cone(7.4, 1.4, 4), '#3F444C', [0, 2.3, 0], [0, Math.PI / 4, 0], [1, 1, 0.3]), part(box(0.3, 3, 0.3), '#6B4A2B', [5.5, 1.5, 3]), part(box(1.4, 0.9, 0.05), this.fc, [6.2, 2.5, 3])), toy);
    bar.position.set(-11, 0.55, 3.5);
    bar.castShadow = bar.receiveShadow = true;
    sc.add(bar);
    // 대장간 (굴뚝)
    const sm = new THREE.Mesh(merge(houseGeo(), part(box(0.6, 2.4, 0.6), '#7B776E', [0.7, 1.4, -0.5])), toy);
    sm.position.set(12, 0.55, -10);
    sm.scale.setScalar(1.5);
    sm.castShadow = true;
    sc.add(sm);
    // 기와집
    const houses: { x: number; y: number; z: number; s: number; ry: number }[] = [];
    for (let x = -21; x <= 21; x += 4.2)
      for (let z = -21; z <= 21; z += 3.8) {
        if (Math.abs(x) < 3 || Math.abs(z) < 3) continue;
        if (Math.hypot(x, z + 10) < 7 || Math.hypot(x + 11, z - 6) < 7 || Math.hypot(x - 11, z - 9) < 6 || Math.hypot(x - 12, z + 10) < 3.5) continue;
        if (this.rnd() < 0.18) continue;
        houses.push({ x: x + this.rnd(-0.4, 0.4), y: 0.55, z: z + this.rnd(-0.4, 0.4), s: this.rnd(0.9, 1.25), ry: this.rnd() < 0.5 ? 0 : Math.PI / 2 });
      }
    const hm = new THREE.InstancedMesh(houseGeo(), toy, houses.length);
    const m4 = new THREE.Matrix4();
    houses.forEach((h, i) => hm.setMatrixAt(i, m4.compose(new THREE.Vector3(h.x, h.y, h.z), q.clone().setFromAxisAngle(Y, h.ry), new THREE.Vector3(h.s, h.s, h.s))));
    hm.castShadow = hm.receiveShadow = true;
    sc.add(hm);
    // 집집마다 밤 불빛
    this.lamps = new THREE.InstancedMesh(new THREE.SphereGeometry(0.18, 6, 4), new THREE.MeshBasicMaterial({ color: '#FFB860' }), houses.length);
    houses.forEach((h, i) => this.lamps.setMatrixAt(i, m4.makeTranslation(h.x + 1.12 * h.s, 0.9, h.z)));
    sc.add(this.lamps);
    // 시장 노점 (상업이 오르면 하나씩 튀어나온다)
    this.stalls = new THREE.InstancedMesh(merge(part(box(1.6, 0.8, 1.1), COL.WOOD, [0, 0.4, 0]), part(box(1.9, 0.08, 1.5), '#C8322B', [0, 1.5, 0], [0.15, 0, 0]), part(cyl(0.05, 0.05, 1.5, 4), '#6B4A2B', [0.8, 0.75, 0.6]), part(cyl(0.05, 0.05, 1.5, 4), '#6B4A2B', [-0.8, 0.75, 0.6]), part(box(1.2, 0.25, 0.7), '#E2B634', [0, 0.9, 0])), toy, this.stallMax);
    this.stalls.castShadow = true;
    sc.add(this.stalls);
    this.stallN = clamp(this.init.stalls, 2, this.stallMax);
    this.layoutStalls(this.stallN);
    // 논밭 작물
    for (let x = FIELD.x0 + 1.5; x < FIELD.x1 - 1; x += 1.6) for (let z = FIELD.z0 + 1.5; z < FIELD.z1 - 1; z += 1.2) this.cropData.push({ x, y: hCity(x, z), z, s: this.rnd(0.8, 1.1), ry: this.rnd(0, 6) });
    this.crops = new THREE.InstancedMesh(merge(part(cone(0.22, 0.9, 5), '#7EA04A', [0, 0.45, 0]), part(cone(0.15, 0.7, 5), '#93AF55', [0.15, 0.35, 0.1])), toy, this.cropData.length);
    sc.add(this.crops);
    this.grow = this.growT = 0.3 + this.init.agri * 0.7;
    this.applyGrow();
    // 사람들
    this.fx = new FX(sc, 900);
    this.civK = new InstancedKit(sc, 'civ', 60, w.quality === 'high');
    this.farmK = new InstancedKit(sc, 'farm', 24, w.quality === 'high');
    this.spearK = new InstancedKit(sc, 'spear', 60, w.quality === 'high');
    this.WP = [
      [0, 18],
      [0, 8],
      [0, -4],
      [8, 0],
      [16, 0],
      [-8, 0],
      [-18, 0],
      [11, 9],
      [10, 5],
      [-6, -12],
      [6, -14],
      [0, -2],
    ];
    for (let i = 0; i < 34; i++) {
      const [x, z] = this.WP[i % this.WP.length]!;
      this.add(this.civK, { x: x + this.rnd(-2, 2), z: z + this.rnd(-2, 2), state: 'walk', fc: TUNIC[i % TUNIC.length]! });
    }
    for (let i = 0; i < 8; i++) this.add(this.farmK, { x: this.rnd(FIELD.x0 + 3, FIELD.x1 - 3), z: this.rnd(FIELD.z0 + 3, FIELD.z1 - 3), state: 'farm', fc: TUNIC[i % 3]! });
    for (let i = 0; i < clamp(this.init.drill, 6, 24); i++) this.addDrill(false);
    for (const [x, z, yaw] of [
      [2.2, CW + 2, 0],
      [-2.2, CW + 2, 0],
      [-CW - 2, 2.2, -Math.PI / 2],
      [-CW - 2, -2.2, -Math.PI / 2],
    ] as const)
      this.add(this.spearK, { x, z, state: 'guard', fc: this.fc, yaw });
    // 영역 누르기 (시설 정보)
    const area = (k: Spot, x: number, z: number, w2: number, d2: number) => this.hits.push({ k, box: new THREE.Box3(new THREE.Vector3(x - w2 / 2, 0, z - d2 / 2), new THREE.Vector3(x + w2 / 2, 5, z + d2 / 2)) });
    area('field', -47, 0, 34, 44);
    area('market', 10, 8.7, 13, 13);
    area('yamen', 0, -11, 13, 9);
    area('barracks', -11, 7, 13, 11);
    area('smithy', 12, -12, 5, 4);
    const cam = w.cam;
    cam.minD = 14;
    cam.maxD = 110;
    cam.bounds = [-70, 40, -40, 40];
    const [sx, sz, sd] = SPOTS.all;
    cam.set(sx, 0, sz, 0.5, 0.82, sd, true);
    w.env.fogNear = 90;
    w.env.fogFar = 260;
  }

  private add(kit: InstancedKit, o: { x: number; z: number; state: Person['state']; fc: string; yaw?: number }): Person {
    const p: Person = {
      x: o.x,
      y: hCity(o.x, o.z),
      z: o.z,
      vx: 0,
      vz: 0,
      yaw: o.yaw ?? 0,
      walk: this.rnd(0, 6),
      move: 0,
      bob: 0,
      lean: 0,
      atk: -1,
      pose: 'up',
      aimV: 0,
      dead: false,
      fall: 0,
      fallSign: 1,
      hide: false,
      scale: 1.15,
      fc: new THREE.Color(o.fc),
      coat: new THREE.Color('#7A5236'),
      state: o.state,
      goal: [o.x, o.z],
      cd: this.rnd(0, 1),
      pause: this.rnd(0, 3),
    };
    if (kit.add(p)) this.people.push(p);
    return p;
  }

  private drillN = 0;
  private addDrill(fromGate: boolean): void {
    const i = this.drillN++;
    const post: [number, number] = [-16.5 + (i % 6) * 1.25, 6.5 + Math.floor(i / 6) * 1.3];
    const p = this.add(this.spearK, { x: fromGate ? this.rnd(-1, 1) : post[0], z: fromGate ? CW + 4 + i * 0.4 : post[1], state: fromGate ? 'goto' : 'drill', fc: this.fc });
    p.goal = post;
    if (fromGate) {
      p.path = [
        [0, CW - 2],
        [0, 8],
        post,
      ];
      p.pi = 0;
      p.then = 'drill';
    }
  }

  private layoutStalls(n: number): void {
    const m4 = new THREE.Matrix4();
    for (let i = 0; i < this.stallMax; i++) {
      const x = 7 + (i % 4) * 2.6;
      const z = 6 + Math.floor(i / 4) * 2.8;
      this.stalls.setMatrixAt(i, i < n ? m4.makeTranslation(x, 0.55, z) : m4.makeScale(0, 0, 0));
    }
    this.stalls.instanceMatrix.needsUpdate = true;
  }

  private applyGrow(): void {
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const Y = new THREE.Vector3(0, 1, 0);
    this.cropData.forEach((t, i) => this.crops.setMatrixAt(i, m4.compose(new THREE.Vector3(t.x, t.y, t.z), q.setFromAxisAngle(Y, t.ry), new THREE.Vector3(t.s, t.s * this.grow, t.s))));
    this.crops.instanceMatrix.needsUpdate = true;
  }

  /** 카메라를 그 자리로 */
  focus(k: Spot): void {
    const [x, z, d] = SPOTS[k];
    const cam = this.world.cam;
    cam.set(x, 0, z, k === 'all' ? 0.5 : cam.Y, k === 'all' ? 0.82 : 0.72, d);
    cam.hold = 7;
  }

  /**
   * 명령 결과를 도시에서 벌인다 (엔진이 성공한 뒤 부른다).
   * 개간 = 농부가 서문으로 나가 밭을 갈고 작물이 자람 / 상업 = 노점 + 금빛 / 치안 = 순찰 / 징병 = 신병이 남문으로 들어와 병영 대열 / 훈련 = 박자 2배 / 인재 = 말 탄 장수가 관청 앞으로
   */
  react(cmd: CityCmd, opts: { agriRatio?: number } = {}): void {
    this.focus(CMD_SPOT[cmd]);
    if (cmd === 'agriculture') {
      for (let i = 0; i < 3; i++) {
        const p = this.add(this.farmK, { x: -CW + 2, z: this.rnd(-1, 1), state: 'goto', fc: TUNIC[i]! });
        p.path = [
          [-CW - 3, 0],
          [this.rnd(FIELD.x0 + 4, FIELD.x1 - 4), this.rnd(FIELD.z0 + 4, FIELD.z1 - 4)],
        ];
        p.pi = 0;
        p.then = 'farm';
      }
      this.growT = clamp(0.3 + (opts.agriRatio ?? this.growT) * 0.7, 0.3, 1);
    }
    if (cmd === 'commerce') {
      if (this.stallN < this.stallMax) this.layoutStalls(++this.stallN);
      for (let i = 0; i < 26; i++) this.fx.glow.emit(11 + this.rnd(-3, 3), 1.5, 9 + this.rnd(-3, 3), this.rnd(-1, 1), this.rnd(2, 5), this.rnd(-1, 1), this.rnd(0.8, 1.4), 0.5, 0.1, 6, 4.6, 1.4, 1, 1, 4);
    }
    if (cmd === 'order')
      for (let i = 0; i < 4; i++) {
        const p = this.add(this.spearK, { x: -1 + i * 0.7, z: -4, state: 'patrol', fc: this.fc });
        p.path = [
          [0, -4],
          [0, 18],
          [16, 0],
          [0, -4],
          [-18, 0],
        ];
        p.pi = i % 5;
      }
    if (cmd === 'conscript') for (let i = 0; i < 6; i++) this.addDrill(true);
    if (cmd === 'train') {
      this.drillRate = 2;
      this.drillT = 20;
    }
    if (cmd === 'search') {
      const p = this.add(this.civK, { x: 0, z: CW + 8, state: 'goto', fc: '#E3C27A' });
      p.scale = 1.5;
      p.path = [
        [0, CW - 2],
        [0, -4],
      ];
      p.pi = 0;
      p.then = 'guard';
    }
  }

  /** 자리의 화면 좌표 (+숫자 띄우기) */
  spotScreen(k: Spot, viewW: number, viewH: number): { x: number; y: number } {
    const [x, z] = SPOTS[k];
    const v = new THREE.Vector3(x, 5, z).project(this.world.cam.c);
    return { x: (v.x * 0.5 + 0.5) * viewW, y: (-v.y * 0.5 + 0.5) * viewH };
  }

  pick(ndc: THREE.Vector2): Spot | null {
    this.ray.setFromCamera(ndc, this.world.cam.c);
    for (const h of this.hits) if (this.ray.ray.intersectsBox(h.box)) return h.k;
    return null;
  }

  update(dt: number, w: World3D): void {
    this.t += dt;
    if (Math.abs(this.grow - this.growT) > 0.002) {
      this.grow = lerp(this.grow, this.growT, Math.min(1, dt * 1.5));
      this.applyGrow();
    }
    if (this.drillT > 0 && (this.drillT -= dt) <= 0) this.drillRate = 1;
    if (Math.random() < dt * 3) this.fx.smoke(12.9, 4.5, -10.6, 0.5);
    this.lamps.visible = w.env.lamp > 0.5;
    const beat = (this.t * this.drillRate) % 1.4;
    for (const s of this.people) {
      let gx = s.x;
      let gz = s.z;
      let spd = 1.4;
      if (s.state === 'walk') {
        if (Math.hypot(s.goal[0] - s.x, s.goal[1] - s.z) < 0.8) {
          s.pause = this.rnd(0.5, 3);
          s.goal = this.WP[Math.floor(this.rnd() * this.WP.length)]!;
        }
        if ((s.pause -= dt) <= 0) [gx, gz] = s.goal;
      } else if (s.state === 'farm') {
        [gx, gz] = s.goal;
        if (Math.hypot(gx - s.x, gz - s.z) < 0.4 && (s.cd -= dt) <= 0 && s.atk < 0) {
          s.atk = 0;
          s.cd = this.rnd(0.4, 0.9);
        }
      } else if (s.state === 'drill') {
        [gx, gz] = s.goal;
        spd = 2.4;
        s.yaw = 0;
        if (beat < 0.05 && s.atk < 0) s.atk = 0;
        s.pose = 'low';
      } else if ((s.state === 'goto' || s.state === 'patrol') && s.path) {
        const wp = s.path[s.pi ?? 0]!;
        [gx, gz] = wp;
        spd = s.state === 'patrol' ? 1.6 : 3;
        if (Math.hypot(gx - s.x, gz - s.z) < 0.6) {
          s.pi = (s.pi ?? 0) + 1;
          if (s.pi >= s.path.length) {
            if (s.state === 'patrol') s.pi = 0;
            else {
              s.state = s.then ?? 'walk';
              s.goal = wp;
              s.path = undefined;
            }
          }
        }
      }
      if (s.atk >= 0) {
        s.atk += dt * (s.state === 'drill' ? 2.4 * this.drillRate : 1.6);
        if (s.atk >= 1) {
          s.atk = -1;
          if (s.state === 'drill' && this.drillRate > 1 && Math.random() < 0.3) this.fx.spark(s.x, s.y + 1.2, s.z - 0.6, 3);
          if (s.state === 'farm' && Math.random() < 0.5) this.fx.dustAt(s.x + 0.4, s.y, s.z + 0.3, 0.4);
        }
      }
      const dx = gx - s.x;
      const dz = gz - s.z;
      const d = Math.hypot(dx, dz);
      const sp = d > 0.05 ? Math.min(spd, d * 3) : 0;
      const k = Math.min(1, dt * 6);
      s.vx += ((d > 0.05 ? dx / d : 0) * sp - s.vx) * k;
      s.vz += ((d > 0.05 ? dz / d : 0) * sp - s.vz) * k;
      s.x += s.vx * dt;
      s.z += s.vz * dt;
      s.y = hCity(s.x, s.z);
      const v = Math.hypot(s.vx, s.vz);
      s.move = Math.min(1, v / 2);
      s.walk += v * dt * 5;
      if (v > 0.3 && s.state !== 'drill') s.yaw = Math.atan2(s.vx, s.vz);
      s.bob = Math.abs(Math.sin(s.walk)) * 0.06 * s.move;
    }
    this.civK.sync();
    this.farmK.sync();
    this.spearK.sync();
    this.fx.update(dt);
    void WALL_H;
  }
}
