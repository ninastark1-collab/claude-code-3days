/**
 * 공성 연출 (보여 주기 전용, 성벽 피해는 엔진 값):
 * - 충차대(엔진 BUnit.ram) → 부대 앞에 충차가 붙어 함께 움직이고, 성문에 닿으면 통나무가 박는다
 *   (design/battle-3d.html 하비성 공성의 충차 모형)
 * - 성벽을 치는 부대 → 성벽에 기댄 운제(사다리)
 * - 공성이 벌어지면 공격군 뒤에서 투석기 2대가 돌을 던진다
 * - 엔진 성문이 무너지면 문짝이 안으로 젖혀지고 큰 먼지
 */
import * as THREE from 'three';
import type { BattleState, BUnit } from '../../engine/battle/types';
import type { CamRig } from '../camera';
import { lerp } from '../math';
import { catapultArmGeo, catapultGeo, ladderGeo, ramGeo, ramLogGeo, rockGeo } from '../models/castle';
import { kitMaterials } from '../models/kit';
import { CELL, cellToWorld, type BuiltField } from './field';
import type { FX } from './fx';

interface Machine {
  root: THREE.Group;
  part?: THREE.Object3D;
  unit?: string;
  t: number;
  lastCd: number;
}
interface Rock {
  m: THREE.Mesh;
  a: THREE.Vector3;
  b: THREE.Vector3;
  t: number;
}

export class SiegeView {
  private rams: Machine[] = [];
  private ladders: Machine[] = [];
  private cats: Machine[] = [];
  private rocks: Rock[] = [];
  private fireT = 0;
  private wasBroken = new Set<number>();

  constructor(
    private scene: THREE.Object3D,
    private b: BattleState,
    private field: BuiltField,
    private fx: FX,
  ) {
    const { toy } = kitMaterials();
    const mk = (g: THREE.BufferGeometry) => {
      const m = new THREE.Mesh(g, toy);
      m.castShadow = true;
      return m;
    };
    for (let i = 0; i < 3; i++) {
      const root = new THREE.Group();
      root.add(mk(ramGeo()));
      const log = mk(ramLogGeo());
      log.position.y = 1.1;
      root.add(log);
      root.visible = false;
      scene.add(root);
      this.rams.push({ root, part: log, t: 0, lastCd: 0 });
    }
    for (let i = 0; i < 5; i++) {
      const root = new THREE.Group();
      root.add(mk(ladderGeo()));
      root.visible = false;
      scene.add(root);
      this.ladders.push({ root, t: 0, lastCd: 0 });
    }
    for (let i = 0; i < 2; i++) {
      const root = new THREE.Group();
      root.add(mk(catapultGeo()));
      const arm = new THREE.Group();
      arm.position.y = 2.15;
      arm.add(mk(catapultArmGeo()));
      root.add(arm);
      root.visible = false;
      scene.add(root);
      this.cats.push({ root, part: arm, t: i * 2, lastCd: 0 });
    }
  }

  private siegers(): { u: BUnit; tx: number; ty: number; gate: boolean }[] {
    const out: { u: BUnit; tx: number; ty: number; gate: boolean }[] = [];
    for (const u of this.b.units) {
      if (u.status !== 'active' || u.side !== 'atk' || u.order.type !== 'siege') continue;
      const { x, y } = u.order;
      if (Math.max(Math.abs(u.x - x), Math.abs(u.y - y)) > 2) continue;
      const t = this.b.tiles[y * this.b.w + x];
      if (!t || (t.t !== 'gate' && t.t !== 'wall')) continue;
      out.push({ u, tx: x, ty: y, gate: t.t === 'gate' });
    }
    return out;
  }

  update(dt: number, running: boolean, cam: CamRig, squadOf?: (unitId: string) => { cx: number; cz: number; dir: number } | undefined): void {
    const list = this.siegers();
    // 충차는 충차대만 끈다 (성문을 치는 중이면 성문 앞, 아니면 부대 앞에 붙어 함께 전진)
    const ramUnits = this.b.units.filter((u) => u.ram && u.status === 'active' && u.side === 'atk');
    const ladL = list.filter((s) => !s.gate && s.u.kind !== 'archer');
    // 충차·사다리를 공격 부대 쪽 성 바깥면에 놓는다
    const place = (m: Machine, s: (typeof list)[number], off: number) => {
      const [wx, wz] = cellToWorld(this.b, s.tx, s.ty);
      const [ux, uz] = cellToWorld(this.b, s.u.x, s.u.y);
      let dx = ux - wx;
      let dz = uz - wz;
      // 칸 축 방향으로 맞춘다 (성벽 면에 수직)
      if (Math.abs(dx) >= Math.abs(dz)) dz = 0;
      else dx = 0;
      const d = Math.hypot(dx, dz) || 1;
      dx /= d;
      dz /= d;
      const x = wx + dx * (CELL * 0.5 + off);
      const z = wz + dz * (CELL * 0.5 + off);
      m.root.visible = true;
      m.root.position.set(x, this.field.heightAt(x, z), z);
      m.root.rotation.y = Math.atan2(-dx, -dz);
      // 엔진 공격 쿨다운이 다시 차면 이번 틱에 쳤다
      if (s.u.atkCd > m.lastCd && running) {
        if (m.part) m.t = 0.001;
        this.fx.burst(wx + dx * CELL * 0.5, this.field.heightAt(wx, wz) + 1.5, wz + dz * CELL * 0.5, m.part ? 10 : 4, 0.6);
        cam.shake = Math.min(0.6, cam.shake + (m.part ? 0.15 : 0.05));
      }
      m.lastCd = s.u.atkCd;
    };
    this.rams.forEach((m, i) => {
      const u = ramUnits[i];
      if (!u) return void (m.root.visible = false);
      const s = list.find((x) => x.u === u && x.gate);
      if (s) place(m, s, 1.8);
      else {
        const q = squadOf?.(u.id);
        if (!q) return void (m.root.visible = false);
        const x = q.cx + Math.sin(q.dir) * 2.4;
        const z = q.cz + Math.cos(q.dir) * 2.4;
        m.root.visible = true;
        m.root.position.set(x, this.field.heightAt(x, z), z);
        m.root.rotation.y = q.dir;
      }
      // 통나무: 뒤로 당겼다가 박는다
      if (m.t > 0) m.t = Math.min(1, m.t + dt * 2.5);
      const k = m.t > 0 ? Math.sin(m.t * Math.PI) : 0;
      m.part!.position.z = lerp(-0.6, 0.9, k);
      if (m.t >= 1) m.t = 0;
    });
    this.ladders.forEach((m, i) => {
      const s = ladL[i];
      if (!s) return void (m.root.visible = false);
      place(m, s, 0.9);
      m.root.children[0]!.rotation.x = 0.22;
    });
    // 투석기
    const active = list.length > 0;
    const atk = this.b.units.filter((u) => u.side === 'atk' && u.status === 'active');
    const ax = atk.length ? Math.min(...atk.map((u) => u.x)) : 2;
    this.cats.forEach((m, i) => {
      m.root.visible = active;
      if (!active) return;
      const [x, z] = cellToWorld(this.b, Math.max(0, ax - 2), 4 + i * 7);
      m.root.position.set(x, this.field.heightAt(x, z), z);
      m.root.rotation.y = Math.PI / 2;
      if (m.t > 0 && m.t < 1) m.t = Math.min(1, m.t + dt * 3);
      const k = m.t > 0 && m.t < 1 ? Math.sin(m.t * Math.PI) : 0;
      m.part!.rotation.x = lerp(0.9, -0.6, k);
    });
    if (active && running) {
      this.fireT -= dt;
      if (this.fireT <= 0) {
        this.fireT = 3.5 + Math.random() * 1.5;
        const c = this.cats[Math.floor(Math.random() * 2)]!;
        const s = list[Math.floor(Math.random() * list.length)]!;
        c.t = 0.001;
        const [tx, tz] = cellToWorld(this.b, s.tx, s.ty);
        const m = new THREE.Mesh(rockGeo(), kitMaterials().flat);
        m.castShadow = true;
        this.scene.add(m);
        const a = c.root.position.clone().add(new THREE.Vector3(0, 4, 0));
        this.rocks.push({ m, a, b: new THREE.Vector3(tx, this.field.heightAt(tx, tz) + 3.5, tz), t: 0 });
      }
    }
    for (let i = this.rocks.length - 1; i >= 0; i--) {
      const r = this.rocks[i]!;
      r.t += dt / 1.6;
      const u = Math.min(1, r.t);
      r.m.position.lerpVectors(r.a, r.b, u);
      r.m.position.y += 4 * 9 * u * (1 - u);
      r.m.rotation.x += dt * 6;
      if (u >= 1) {
        this.fx.burst(r.b.x, r.b.y, r.b.z, 26, 1);
        cam.shake = Math.min(0.6, cam.shake + 0.3);
        this.scene.remove(r.m);
        r.m.geometry.dispose();
        this.rocks.splice(i, 1);
      }
    }
    // 성문: 엔진에서 무너지면 문짝이 안으로 젖혀진다 + 큰 먼지
    for (const g of this.field.gates) {
      if (g.broken && !this.wasBroken.has(g.tile)) {
        this.wasBroken.add(g.tile);
        const p = g.root.position;
        this.fx.burst(p.x, p.y + 2, p.z, 60, 1.6);
        cam.shake = Math.min(0.6, cam.shake + 0.5);
      }
      g.open = lerp(g.open, g.broken ? 1 : 0, Math.min(1, dt * 3));
      g.doors.forEach((d, k) => (d.rotation.y = (k ? -1 : 1) * g.open * 1.5));
    }
  }
}
