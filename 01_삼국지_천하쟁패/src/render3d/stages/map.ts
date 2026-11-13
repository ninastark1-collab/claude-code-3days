/**
 * 천하 지도 3D (설계서: 지형 위에 세력 영토 색과 국경, 도시 미니어처, 진군 화살표, 구름).
 * 지리(해안선·강·산·도시 경위도)는 2D 지도와 같은 데이터를 받는다. 도시 주인·위협은 엔진 값.
 */
import * as THREE from 'three';
import { fbm, mixC, seeded, smooth, type RGB } from '../math';
import { box, COL, cone, cyl, kitMaterials, merge, part } from '../models/kit';
import { patchTerrain, patchWater } from '../shaders';
import type { Stage, World3D } from '../world';

export interface MapGeo {
  land: [number, number][];
  rivers: { pts: [number, number][] }[];
  mounts: [number, number][];
  cityLonLat: Record<string, [number, number]>;
}
export interface MapCityView {
  id: string;
  faction: string | null;
  capital?: boolean;
}

const K = 6;
const LON0 = 111.5;
const LAT0 = 32.25;
export const lonLatToWorld = (lon: number, lat: number): [number, number] => [(lon - LON0) * K, (LAT0 - lat) * K];

function inPoly(x: number, y: number, poly: [number, number][]): boolean {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]!;
    const [xj, yj] = poly[j]!;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}
function segDist(px: number, pz: number, ax: number, az: number, bx: number, bz: number): number {
  const vx = bx - ax;
  const vz = bz - az;
  const t = Math.max(0, Math.min(1, ((px - ax) * vx + (pz - az) * vz) / (vx * vx + vz * vz || 1)));
  return Math.hypot(px - ax - vx * t, pz - az - vz * t);
}

const GRASS: RGB = [0.5, 0.62, 0.34];
const DRY: RGB = [0.66, 0.6, 0.42];
const ROCK: RGB = [0.56, 0.53, 0.47];
const SAND: RGB = [0.78, 0.72, 0.56];
const RIVER: RGB = [0.24, 0.42, 0.52];

export class MapStage implements Stage {
  tilt = { band: 0.24, amt: 3.2 };
  private ground!: THREE.Mesh;
  private world!: World3D;
  private hAt!: (x: number, z: number) => number;
  private landAt!: (x: number, z: number) => boolean;
  private riverD!: (x: number, z: number) => number;
  private cityPos = new Map<string, THREE.Vector3>();
  private flags!: THREE.InstancedMesh;
  private ring!: THREE.Mesh;
  private arrows = new THREE.Group();
  private clouds!: THREE.InstancedMesh;
  private cloudData: { x: number; z: number; y: number; s: number; v: number }[] = [];
  private ray = new THREE.Raycaster();
  private ownersKey = '';


  constructor(
    private geo: MapGeo,
    private cities: MapCityView[],
    private roads: [string, string, 'land' | 'water'][],
    private factionColor: (f: string | null) => string,
  ) {}

  build(w: World3D): void {
    this.world = w;
    const land = this.geo.land.map(([lo, la]) => lonLatToWorld(lo, la));
    const rivers = this.geo.rivers.map((r) => r.pts.map(([lo, la]) => lonLatToWorld(lo, la)));
    const mounts = this.geo.mounts.map(([lo, la]) => lonLatToWorld(lo, la));
    this.landAt = (x, z) => inPoly(x, z, land);
    this.riverD = (x, z) => {
      let m = 1e9;
      for (const r of rivers) for (let i = 0; i < r.length - 1; i++) m = Math.min(m, segDist(x, z, r[i]![0], r[i]![1], r[i + 1]![0], r[i + 1]![1]));
      return m;
    };
    // 해안까지의 거리로 바닷가 높이를 낮춘다
    const coastD = (x: number, z: number) => {
      let m = 1e9;
      for (let i = 0; i < land.length; i++) {
        const a = land[i]!;
        const b = land[(i + 1) % land.length]!;
        m = Math.min(m, segDist(x, z, a[0], a[1], b[0], b[1]));
      }
      return m;
    };
    this.hAt = (x, z) => {
      const onLand = this.landAt(x, z);
      const cd = coastD(x, z);
      // 해안선을 기준으로 부드럽게 이어지게 (바다 쪽은 서서히 깊어짐)
      if (!onLand) return -smooth(0, 6, cd) * 2.4;
      let h = smooth(0, 3, cd) * 0.3 + smooth(1, 8, cd) * (0.6 + fbm(x * 0.04 + 5, z * 0.04 + 3, 4) * 2.2);
      for (const [mx, mz] of mounts) {
        const d = Math.hypot(x - mx, z - mz);
        if (d < 14) h += (1 - d / 14) ** 2 * (5 + fbm(x * 0.2, z * 0.2, 3) * 4);
      }
      // 서쪽 고원
      h += smooth(-40, -80, x) * (3 + fbm(x * 0.05, z * 0.05, 3) * 6);
      // 강: 넓은 골짜기로 부드럽게 파인다
      const rd = this.riverD(x, z);
      if (rd < 5) h = h * smooth(0.6, 5, rd) + 0.05 * (1 - smooth(0.6, 5, rd));
      return h;
    };
    const g = new THREE.PlaneGeometry(200, 150, 200, 150);
    g.rotateX(-Math.PI / 2);
    const p = g.attributes.position!;
    for (let i = 0; i < p.count; i++) p.setY(i, this.hAt(p.getX(i), p.getZ(i)));
    g.computeVertexNormals();
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(p.count * 3), 3));
    const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 });
    patchTerrain(m, w.U, 'map');
    this.ground = new THREE.Mesh(g, m);
    this.ground.receiveShadow = true;
    w.scene.add(this.ground);
    const sea = new THREE.Mesh(new THREE.PlaneGeometry(400, 300).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#3A6F86', roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.9 }));
    patchWater(sea.material as THREE.MeshStandardMaterial, w.U);
    sea.position.y = -0.35;
    w.scene.add(sea);

    // 도시 미니어처 (작은 도시·큰 도시 2종, 세력 깃발은 인스턴스 색)
    const { toy } = kitMaterials();
    const small = merge(part(box(2.2, 0.5, 2.2), '#C2A67E', [0, 0.25, 0]), part(box(1.2, 0.6, 1), '#E8DFCF', [0, 0.75, 0]), part(cone(0.95, 0.5, 4), '#3F444C', [0, 1.3, 0], [0, Math.PI / 4, 0]));
    const big = merge(
      part(box(3.4, 0.7, 3.4), '#C2A67E', [0, 0.35, 0]),
      part(box(2.2, 0.8, 1.6), '#ECE4D4', [0, 1.1, 0]),
      part(cone(1.7, 0.7, 4), '#3F444C', [0, 1.85, 0], [0, Math.PI / 4, 0]),
      part(box(1.2, 0.5, 0.9), '#ECE4D4', [0, 2.4, 0]),
      part(cone(1, 0.55, 4), '#3F444C', [0, 2.9, 0], [0, Math.PI / 4, 0]),
      part(box(0.4, 0.5, 0.4), COL.RED, [1.4, 0.95, 1.4]),
    );
    const smallL = this.cities.filter((c) => !c.capital);
    const bigL = this.cities.filter((c) => c.capital);
    const put = (geo: THREE.BufferGeometry, list: MapCityView[]) => {
      const im = new THREE.InstancedMesh(geo, toy, Math.max(1, list.length));
      const m4 = new THREE.Matrix4();
      list.forEach((c, i) => {
        const v = this.posOf(c.id);
        im.setMatrixAt(i, m4.makeTranslation(v.x, v.y, v.z));
      });
      im.count = list.length;
      im.castShadow = im.receiveShadow = true;
      w.scene.add(im);
    };
    put(small, smallL);
    put(big, bigL);
    this.flags = new THREE.InstancedMesh(merge(part(cyl(0.06, 0.06, 2.4, 4), '#6B4A2B', [0, 1.2, 0]), part(box(0.05, 0.7, 0.9), COL.WHITE, [0, 2.0, 0.45])), toy, Math.max(1, this.cities.length));
    this.flags.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(this.cities.length * 3).fill(1), 3);
    w.scene.add(this.flags);
    // 길 (육로·물길)
    const pts: number[] = [];
    const wpts: number[] = [];
    for (const [a, b, kind] of this.roads) {
      const A = this.posOf(a);
      const B = this.posOf(b);
      (kind === 'water' ? wpts : pts).push(A.x, A.y + 0.15, A.z, B.x, B.y + 0.15, B.z);
    }
    const lines = (arr: number[], color: string) => {
      const gg = new THREE.BufferGeometry();
      gg.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
      const l = new THREE.LineSegments(gg, new THREE.LineDashedMaterial({ color, dashSize: 0.8, gapSize: 0.6, transparent: true, opacity: 0.8 }));
      l.computeLineDistances();
      w.scene.add(l);
    };
    lines(pts, '#5A4632');
    lines(wpts, '#2F5F7A');
    // 고른 도시 고리
    this.ring = new THREE.Mesh(new THREE.TorusGeometry(2.6, 0.18, 6, 32).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#E3C27A' }));
    this.ring.visible = false;
    w.scene.add(this.ring);
    w.scene.add(this.arrows);
    // 구름 (천천히 흐른다)
    const rnd = seeded(31);
    const cg = merge(part(new THREE.IcosahedronGeometry(1, 1), COL.WHITE, [0, 0, 0], [0, 0, 0], [2.2, 0.8, 1.6]), part(new THREE.IcosahedronGeometry(0.8, 1), COL.WHITE, [1.6, -0.1, 0.3], [0, 0, 0], [1.6, 0.7, 1.2]), part(new THREE.IcosahedronGeometry(0.7, 1), COL.WHITE, [-1.5, -0.1, -0.2], [0, 0, 0], [1.5, 0.6, 1.1]));
    this.clouds = new THREE.InstancedMesh(cg, new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 1, transparent: true, opacity: 0.85, flatShading: true }), 14);
    for (let i = 0; i < 14; i++) this.cloudData.push({ x: rnd(-100, 100), z: rnd(-70, 70), y: rnd(14, 20), s: rnd(1.5, 3), v: rnd(0.6, 1.4) });
    this.clouds.castShadow = true;
    w.scene.add(this.clouds);
    this.recolor();
    const cam = w.cam;
    cam.minD = 30;
    cam.maxD = 260;
    cam.bounds = [-95, 95, -70, 70];
    cam.speed = 4;
    cam.set(4, 0, 2, 0, 1.0, 200, true);
    w.env.fogNear = 220;
    w.env.fogFar = 520;
    w.env.apply();
    w.env.sun.shadow.camera.left = w.env.sun.shadow.camera.bottom = -110;
    w.env.sun.shadow.camera.right = w.env.sun.shadow.camera.top = 110;
    w.env.sun.shadow.camera.updateProjectionMatrix();
  }

  posOf(id: string): THREE.Vector3 {
    let v = this.cityPos.get(id);
    if (!v) {
      const ll = this.geo.cityLonLat[id] ?? [LON0, LAT0];
      const [x, z] = lonLatToWorld(ll[0], ll[1]);
      v = new THREE.Vector3(x, Math.max(0.3, this.hAt(x, z)), z);
      this.cityPos.set(id, v);
    }
    return v;
  }

  /** 도시 주인이 바뀌면 영토 색·국경·깃발을 다시 칠한다 (엔진 값) */
  setCities(cities: MapCityView[]): void {
    this.cities = cities;
    this.recolor();
  }

  private recolor(): void {
    const key = this.cities.map((c) => c.faction ?? '-').join(',');
    if (key === this.ownersKey) return;
    this.ownersKey = key;
    const col = new Map<string | null, RGB>();
    const rgb = (f: string | null): RGB => {
      let c = col.get(f);
      if (!c) {
        const t = new THREE.Color(this.factionColor(f));
        c = [t.r, t.g, t.b];
        col.set(f, c);
      }
      return c;
    };
    const cs = this.cities.map((c) => ({ c, p: this.posOf(c.id) }));
    const g = this.ground.geometry;
    const p = g.attributes.position!;
    const n = g.attributes.normal!;
    const ca = g.attributes.color as THREE.BufferAttribute;
    const out = new THREE.Color();
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i);
      const y = p.getY(i);
      const z = p.getZ(i);
      let base = mixC(GRASS, DRY, smooth(0.35, 0.7, fbm(x * 0.03 + 9, z * 0.03 + 2, 3)));
      base = mixC(base, ROCK, smooth(0.85, 0.65, n.getY(i)) + smooth(3, 8, y) * 0.5);
      if (y < 0.15) base = mixC(base, SAND, 0.7);
      if (y < -0.3) base = [0.3, 0.42, 0.45];
      if (this.landAt(x, z) && this.riverD(x, z) < 1.1) base = RIVER;
      // 가장 가까운 도시 둘 → 영토 색 + 국경
      let d1 = 1e9;
      let d2 = 1e9;
      let f1: string | null = null;
      for (const { c, p: cp } of cs) {
        const d = (cp.x - x) ** 2 + (cp.z - z) ** 2;
        if (d < d1) {
          if (c.faction !== f1) d2 = d1;
          d1 = d;
          f1 = c.faction;
        } else if (d < d2 && c.faction !== f1) d2 = d;
      }
      let rc = base;
      if (y > -0.2 && f1 && d1 < 26 * 26) {
        const fc = rgb(f1);
        rc = mixC(base, fc, 0.42);
        const edge = Math.sqrt(d2) - Math.sqrt(d1);
        if (edge < 0.9) rc = mixC(rc, [fc[0] * 0.45, fc[1] * 0.45, fc[2] * 0.45], 0.75);
      }
      out.setRGB(rc[0], rc[1], rc[2], THREE.SRGBColorSpace);
      ca.setXYZ(i, out.r, out.g, out.b);
    }
    ca.needsUpdate = true;
    const m4 = new THREE.Matrix4();
    const c = new THREE.Color();
    this.cities.forEach((ct, i) => {
      const v = this.posOf(ct.id);
      this.flags.setMatrixAt(i, m4.makeTranslation(v.x + 1.2, v.y, v.z - 1.2));
      this.flags.setColorAt(i, c.set(this.factionColor(ct.faction)));
    });
    this.flags.count = this.cities.length;
    this.flags.instanceMatrix.needsUpdate = true;
    this.flags.instanceColor!.needsUpdate = true;
  }

  setSelected(id: string | null): void {

    this.ring.visible = !!id;
    if (id) {
      const v = this.posOf(id);
      this.ring.position.set(v.x, v.y + 0.2, v.z);
    }
  }

  /** 붉은 진군 화살표 [출발, 도착] */
  setThreats(list: [string, string][]): void {
    for (const c of [...this.arrows.children]) {
      this.arrows.remove(c);
      (c as THREE.Mesh).geometry.dispose();
    }
    const mat = new THREE.MeshBasicMaterial({ color: '#C8322B', transparent: true, opacity: 0.85 });
    for (const [a, b] of list) {
      const A = this.posOf(a);
      const B = this.posOf(b);
      const mid = A.clone().lerp(B, 0.5);
      mid.y += 4;
      const curve = new THREE.QuadraticBezierCurve3(A.clone().setY(A.y + 1), mid, B.clone().lerp(A, 0.12).setY(B.y + 1));
      const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 16, 0.22, 5), mat);
      const end = curve.getPoint(1);
      const dir = curve.getTangent(1);
      const head = new THREE.Mesh(new THREE.ConeGeometry(0.7, 1.6, 6), mat);
      head.position.copy(end);
      head.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
      this.arrows.add(tube, head);
    }
  }

  /** 도시를 화면 가운데로 (오른쪽 시트가 열려 있으면 그만큼 왼쪽에 보이게) */
  focus(id: string, rightInsetFrac = 0, near = false): void {
    const v = this.posOf(id);
    const cam = this.world.cam;
    const D = near ? 90 : cam.D;
    const shift = rightInsetFrac * 2 * D * Math.tan((cam.c.fov * Math.PI) / 360) * cam.c.aspect * 0.5;
    cam.T.set(v.x + shift, 0, v.z);
    cam.D = D;
    cam.hold = 2;
  }

  /** 누른 곳에서 가장 가까운 도시 (화면 반경 안) */
  pick(ndc: THREE.Vector2): string | null {
    this.ray.setFromCamera(ndc, this.world.cam.c);
    const hit = this.ray.intersectObject(this.ground, false)[0];
    if (!hit) return null;
    let best: string | null = null;
    let bd = (3 + this.world.cam.dist * 0.03) ** 2;
    for (const c of this.cities) {
      const v = this.posOf(c.id);
      const d = (v.x - hit.point.x) ** 2 + (v.z - hit.point.z) ** 2;
      if (d < bd) (bd = d), (best = c.id);
    }
    return best;
  }

  /** 카메라 거리 (확대 단계 판단) */
  get zoomDist(): number {
    return this.world.cam.dist;
  }

  /** 도시 이름표 위치 (논리 화면 좌표) */
  labels(viewW: number, viewH: number): { id: string; x: number; y: number; ok: boolean }[] {
    const cam = this.world.cam.c;
    const v = new THREE.Vector3();
    return this.cities.map((c) => {
      const p = this.posOf(c.id);
      v.set(p.x, p.y + (c.capital ? 3.6 : 2.4), p.z).project(cam);
      return { id: c.id, x: (v.x * 0.5 + 0.5) * viewW, y: (-v.y * 0.5 + 0.5) * viewH, ok: v.z < 1 && Math.abs(v.x) < 1.05 && Math.abs(v.y) < 1.05 };
    });
  }

  update(dt: number, w: World3D): void {
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    this.cloudData.forEach((c, i) => {
      c.x += c.v * dt;
      if (c.x > 110) c.x = -110;
      this.clouds.setMatrixAt(i, m4.compose(new THREE.Vector3(c.x, c.y, c.z), q, s.setScalar(c.s)));
    });
    this.clouds.instanceMatrix.needsUpdate = true;
    // 위협 화살표는 맥박친다
    const k = 0.7 + Math.sin(w.U.time.value * 4) * 0.25;
    for (const a of this.arrows.children) ((a as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = k;
    if (this.ring.visible) this.ring.rotation.y += dt;
  }
}
