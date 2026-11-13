/**
 * 전투 3D 장면: 엔진 BattleState 를 읽어 전장·병사를 그린다 (값을 바꾸지 않는다).
 * 관전 화면(Battle.tsx)이 엔진 틱을 진행시키고, 이 장면은 매 프레임 그 결과를 따라간다.
 */
import * as THREE from 'three';
import type { BattleState, BUnit, Side } from '../../engine/battle/types';
import { buildField, CELL, cellToWorld, worldToCell, type BuiltField } from '../battle/field';
import { Arrows, FX } from '../battle/fx';
import { HeroSet, heroPortrait } from '../battle/heroes';
import { InstancedKit } from '../battle/kit';
import { SiegeView } from '../battle/siege';
import { BattleSim, type Squad } from '../battle/sim';
import { heroDesc, type HeroDesc, type HeroLookInput } from '../models/hero';
import { clamp, lerp } from '../math';
type BattleKind = 'spear' | 'arch' | 'cav';
import { QUALITY } from '../quality';
import type { Stage, World3D } from '../world';

export interface SquadLabel {
  id: string;
  x: number;
  y: number;
  ok: boolean;
}

export class BattleStage implements Stage {
  tilt = { band: 0.17, amt: 4.5 };
  field!: BuiltField;
  sim!: BattleSim;
  private kits!: Record<BattleKind, InstancedKit>;
  private world!: World3D;
  private wallT = 0;
  private wallSig = '';
  private ray = new THREE.Raycaster();
  private tmp = new THREE.Vector3();
  /** 카메라가 따라갈 지점 (일기토 등) */
  private focusUntil = 0;
  fx!: FX;
  private arrows!: Arrows;
  private heroes!: HeroSet;
  private descs = new Map<string, HeroDesc>();
  private fireLights: THREE.PointLight[] = [];
  private siege!: SiegeView;
  private fireAcc = 0;

  constructor(
    private b: BattleState,
    private viewer: Side,
    private factionColor: (f: string | null) => string,
    /** 무장 얼굴 데이터 (2D 초상과 같은 얼굴) */
    private look: (u: BUnit) => HeroLookInput,
  ) {}

  build(w: World3D): void {
    this.world = w;
    const spec = QUALITY[w.quality];
    this.field = buildField(w.U, this.b, w.quality);
    w.scene.add(this.field.group);
    // 병사 그림자는 고급 단계만 (보통·절약은 삼각형 예산 30만을 지키려고 지형 그림자만)
    const shadow = w.quality === 'high';
    this.kits = {
      spear: new InstancedKit(w.scene, 'spear', spec.soldiers, shadow),
      arch: new InstancedKit(w.scene, 'arch', spec.soldiers, shadow),
      cav: new InstancedKit(w.scene, 'cav', spec.soldiers, shadow),
    };
    this.fx = new FX(w.scene, w.quality === 'saver' ? 900 : 1800);
    this.arrows = new Arrows(w.scene, this.fx, w.quality === 'saver' ? 200 : 420);
    for (let i = 0; i < 3; i++) {
      const l = new THREE.PointLight(0xff7a2a, 0, 26, 1.4);
      w.scene.add(l);
      this.fireLights.push(l);
    }
    this.sim = new BattleSim(this.b.units, {
      budget: spec.soldiers,
      viewer: this.viewer,
      heightAt: this.field.standAt,
      toWorld: (cx, cy) => cellToWorld(this.b, cx, cy),
      factionColor: this.factionColor,
      kits: this.kits,
      walk: this.field.walk,
    });
    const entries = this.sim.squads.map((q) => {
      const desc = heroDesc(this.look(q.unit));
      this.descs.set(q.unit.id, desc);
      return { state: q.hero, desc, fc: this.factionColor(q.unit.faction) };
    });
    this.heroes = new HeroSet(w.scene, entries, shadow);
    this.siege = new SiegeView(w.scene, this.b, this.field, this.fx);
    const cam = w.cam;
    cam.minD = 12;
    cam.maxD = 110;
    cam.bounds = [-52, 52, -36, 36];
    cam.set(-4, 0, 6, 0.1, 0.78, 78, true);
    w.env.fogNear = 90;
    w.env.fogFar = 260;
  }

  /** 엔진 진행 속도 (초당 틱, 0 = 멈춤) */
  setTps(tps: number): void {
    if (this.sim) this.sim.tps = tps;
  }

  update(dt: number, w: World3D): void {
    this.sim.update(dt);
    this.heroes.sync(w.U.time.value, (i) => !this.sim.squads[i]!.visible);
    // 효과 사건
    const ev = this.sim.events;
    let dust = 0;
    for (const e of ev) {
      if (e.k === 'spark') this.fx.spark(e.x, e.y, e.z, 5);
      else if (e.k === 'gold') this.fx.spark(e.x, e.y, e.z, 10, true);
      else if (e.k === 'dust' && dust++ < 12) this.fx.dustAt(e.x, e.y, e.z, 1);
      else if (e.k === 'poof') this.fx.poof(e.x, e.y, e.z);
      else if (e.k === 'splash') this.fx.splash(e.x, e.y, e.z);
      else if (e.k === 'arrow') this.arrows.fire(e.x, e.y, e.z, e.tx, e.ty, e.tz);
      else if (e.k === 'shake') w.cam.shake = Math.min(0.6, w.cam.shake + e.v);
    }
    ev.length = 0;
    if (this.sim.fallen >= 3) w.cam.shake = Math.min(0.6, w.cam.shake + 0.04 * this.sim.fallen);
    this.burn(dt);
    this.siege.update(dt, this.sim.tps > 0, w.cam, (id) => this.sim.squads.find((q) => q.unit.id === id));
    const running = this.sim.tps > 0 ? 1 : 0;
    this.arrows.update(dt * running);
    this.fx.update(dt);

    // 성벽·성문이 무너졌는지 0.5초마다 확인
    this.wallT += dt;
    if (this.wallT > 0.5) {
      this.wallT = 0;
      const sig = this.b.tiles.reduce((s, t, i) => (t.t === 'wall' || t.t === 'gate' ? s + i + ',' : s), '');
      if (sig !== this.wallSig) {
        this.wallSig = sig;
        this.field.syncWalls(this.b.tiles);
      }
    }
    // 평상시 관전: 살아 있는 부대들의 무게중심을 천천히 따라가며 좌우로 흐른다 (만지면 4초 멈춤)
    const cam = w.cam;
    if (cam.hold > 0 || cam.lock || performance.now() < this.focusUntil) return;
    cam.Y = 0.1 + Math.sin(w.U.time.value * 0.05) * 0.1;
    let ax = 0;
    let az = 0;
    let an = 0;
    for (const q of this.sim.squads)
      if (q.visible && q.alive && q.mode !== 'rout') {
        ax += q.cx * q.alive;
        az += q.cz * q.alive;
        an += q.alive;
      }
    if (an) {
      const k = Math.min(1, dt * 0.5);
      cam.T.x = lerp(cam.T.x, clamp(ax / an, -36, 36), k);
      cam.T.z = lerp(cam.T.z, clamp(az / an + 4, -24, 24), k);
    }
  }

  /** 엔진에서 불이 붙은 칸: 불꽃·연기·불씨 + 주황 점광원 (최대 3개) */
  private burn(dt: number): void {
    const fires: [number, number, number][] = [];
    this.b.tiles.forEach((t, i) => {
      if (t.fire && t.fire > 0) fires.push([i % this.b.w, Math.floor(i / this.b.w), t.fire]);
    });
    this.fireAcc += dt * 26;
    const n = Math.floor(this.fireAcc);
    this.fireAcc -= n;
    for (const [cx, cy] of fires)
      for (let k = 0; k < n; k++) {
        const [x0, z0] = cellToWorld(this.b, cx, cy);
        const x = x0 + (Math.random() - 0.5) * CELL;
        const z = z0 + (Math.random() - 0.5) * CELL;
        const y = this.field.heightAt(x, z) + 0.1;
        this.fx.flame(x, y, z, 1.1);
        if (Math.random() < 0.18) this.fx.smoke(x, y + 1.5, z, 1.2);
        if (Math.random() < 0.1) this.fx.ember(x, y + 1, z);
      }
    this.fireLights.forEach((l, i) => {
      const f = fires[Math.floor((i * fires.length) / 3)];
      if (!f || i >= fires.length) {
        l.intensity = 0;
        return;
      }
      const [x, z] = cellToWorld(this.b, f[0], f[1]);
      l.position.set(x, this.field.heightAt(x, z) + 2.4, z);
      l.intensity = 55 + Math.random() * 25;
    });
  }

  /** 성문·성벽 처음 내구 (막대 비율 계산용) */
  private maxHp = new Map<number, number>();

  /**
   * 공성 내구도 막대 (엔진 칸 hp): 성문은 늘, 성벽은 공격받는 중이거나 깎인 칸만.
   * ratio 0 = 무너짐
   */
  siegeBars(viewW: number, viewH: number): { key: number; x: number; y: number; ratio: number; gate: boolean; ok: boolean }[] {
    const b = this.b;
    if (!this.maxHp.size) b.tiles.forEach((t, i) => (t.t === 'wall' || t.t === 'gate') && this.maxHp.set(i, Math.max(1, t.hp ?? 1)));
    const targeted = new Set<number>();
    for (const u of b.units) if (u.status === 'active' && u.order.type === 'siege') targeted.add(u.order.y * b.w + u.order.x);
    const out: { key: number; x: number; y: number; ratio: number; gate: boolean; ok: boolean }[] = [];
    const cam = this.world.cam.c;
    for (const [i, max] of this.maxHp) {
      const t = b.tiles[i]!;
      const gate = this.field.gates.some((g) => g.tile === i);
      const standing = t.t === 'wall' || t.t === 'gate';
      const hp = standing ? (t.hp ?? 0) : 0;
      if (!gate && !targeted.has(i) && hp >= max) continue;
      if (!gate && !standing) continue;
      const [x, z] = cellToWorld(b, i % b.w, Math.floor(i / b.w));
      this.tmp.set(x, this.field.heightAt(x, z) + (gate ? 9 : 6.2), z).project(cam);
      out.push({ key: i, x: (this.tmp.x * 0.5 + 0.5) * viewW, y: (-this.tmp.y * 0.5 + 0.5) * viewH, ratio: Math.max(0, hp / max), gate, ok: this.tmp.z < 1 && Math.abs(this.tmp.x) < 1.05 && Math.abs(this.tmp.y) < 1.05 });
    }
    return out;
  }

  /** 부대 장수 초상 (3D 모형을 찍은 그림, 칩·컷인용) */
  portrait(unitId: string): string | null {
    const u = this.b.units.find((x) => x.id === unitId);
    const d = this.descs.get(unitId);
    return u && d ? heroPortrait(u.officer, d, this.factionColor(u.faction)) : null;
  }

  /** 부대 표시 위치 (논리 화면 좌표) */
  labels(viewW: number, viewH: number): SquadLabel[] {
    const cam = this.world.cam.c;
    return this.sim.squads.map((q: Squad) => {
      const p = this.sim.labelAnchor(q, this.tmp).project(cam);
      const ok = q.visible && q.alive > 0 && q.mode !== 'rout' && p.z < 1 && Math.abs(p.x) < 1.05 && Math.abs(p.y) < 1.05;
      return { id: q.unit.id, x: (p.x * 0.5 + 0.5) * viewW, y: (-p.y * 0.5 + 0.5) * viewH, ok };
    });
  }

  /** 화면을 누른 곳의 칸 (없으면 null) */
  pickCell(ndc: THREE.Vector2): [number, number] | null {
    this.ray.setFromCamera(ndc, this.world.cam.c);
    const hit = this.ray.intersectObject(this.field.ground, false)[0];
    if (!hit) return null;
    const [cx, cy] = worldToCell(this.b, hit.point.x, hit.point.z);
    return cx >= 0 && cy >= 0 && cx < this.b.w && cy < this.b.h ? [cx, cy] : null;
  }

  /** 두 칸 사이로 카메라를 가까이 붙인다 (일기토 등) */
  focusCells(ax: number, ay: number, bx: number, by: number, dist = 30, holdMs = 1500): void {
    const [x1, z1] = cellToWorld(this.b, ax, ay);
    const [x2, z2] = cellToWorld(this.b, bx, by);
    const cam = this.world.cam;
    cam.T.set((x1 + x2) / 2, 0, (z1 + z2) / 2);
    cam.D = dist;
    this.focusUntil = performance.now() + holdMs;
  }

  /** 평소 거리로 되돌린다 */
  resetFocus(): void {
    this.world.cam.D = 78;
    this.focusUntil = 0;
  }

  dispose(): void {
    for (const k of Object.values(this.kits ?? {})) k.dispose();
    this.heroes?.dispose();
  }
}
