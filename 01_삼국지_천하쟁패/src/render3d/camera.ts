/**
 * 디오라마 카메라 (시안 Cam) + 터치 입력.
 * - 한 손가락 끌기 = 이동, 두 손가락 = 확대·축소, 탭 = 고르기, 휠 = 확대 (PC 보너스)
 * - 손가락이 닿으면 4초간 연출 카메라를 멈추고 플레이어에게 넘긴다 (hold)
 */
import * as THREE from 'three';
import { clamp } from './math';

const REDUCED = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

export class CamRig {
  readonly c: THREE.PerspectiveCamera;
  /** 현재값 / 목표값 */
  readonly t = new THREE.Vector3();
  readonly T = new THREE.Vector3();
  yaw = 0;
  Y = 0;
  pitch = 0.7;
  Pp = 0.7;
  dist = 40;
  D = 40;
  shake = 0;
  minD = 10;
  maxD = 90;
  /** [x0, x1, z0, z1] */
  bounds: [number, number, number, number] = [-60, 60, -40, 40];
  /** 남은 사용자 조작 시간 (초) */
  hold = 0;
  speed = 3.2;
  /** 연출 중 조작 잠금 */
  lock = false;

  constructor(fov = 32, aspect = 844 / 390) {
    this.c = new THREE.PerspectiveCamera(fov, aspect, 0.5, 1200);
  }

  set(x: number, y: number, z: number, yaw: number, pitch: number, dist: number, instant = false): void {
    this.T.set(x, y, z);
    this.Y = yaw;
    this.Pp = pitch;
    this.D = dist;
    if (instant) {
      this.t.copy(this.T);
      this.yaw = yaw;
      this.pitch = pitch;
      this.dist = dist;
    }
  }

  update(dt: number): void {
    const k = 1 - Math.exp(-dt * this.speed);
    this.t.lerp(this.T, k);
    this.yaw += (this.Y - this.yaw) * k;
    this.pitch += (this.Pp - this.pitch) * k;
    this.dist += (this.D - this.dist) * k;
    const cp = Math.cos(this.pitch);
    const p = this.c.position;
    p.set(this.t.x + Math.sin(this.yaw) * cp * this.dist, this.t.y + Math.sin(this.pitch) * this.dist, this.t.z + Math.cos(this.yaw) * cp * this.dist);
    if (this.shake > 0.002 && !REDUCED) {
      p.x += (Math.random() - 0.5) * this.shake;
      p.y += (Math.random() - 0.5) * this.shake;
      p.z += (Math.random() - 0.5) * this.shake;
    }
    this.shake *= Math.exp(-dt * 7);
    this.hold = Math.max(0, this.hold - dt);
    this.c.lookAt(this.t);
  }

  /** 화면 픽셀(논리 좌표) 만큼 끌었을 때 초점 이동 */
  pan(dx: number, dy: number, viewH: number): void {
    const wpp = (2 * this.dist * Math.tan((this.c.fov * Math.PI) / 360)) / viewH;
    const cy = Math.cos(this.yaw);
    const sy = Math.sin(this.yaw);
    const sp = Math.max(0.4, Math.sin(this.pitch));
    this.T.x -= (cy * dx + (sy * dy) / sp) * wpp;
    this.T.z -= (-sy * dx + (cy * dy) / sp) * wpp;
    const b = this.bounds;
    this.T.x = clamp(this.T.x, b[0], b[1]);
    this.T.z = clamp(this.T.z, b[2], b[3]);
    this.hold = 4;
  }

  zoomTo(D: number): void {
    this.D = clamp(D, this.minD, this.maxD);
    this.hold = 4;
  }
}

export interface InputHandlers {
  /** 탭 (정규화 장치 좌표 -1~1) */
  onTap?: (ndc: THREE.Vector2) => void;
  /** 길게 누르기 (툴팁) */
  onLongPress?: (ndc: THREE.Vector2) => void;
}

/**
 * 캔버스에 터치·마우스 입력을 붙인다. 끌기 거리는 논리 좌표(844 기준)로 바꿔 쓴다.
 * 돌려주는 함수를 부르면 떼어 낸다.
 */
export function attachInput(canvas: HTMLCanvasElement, getRig: () => CamRig, logicalH: () => number, h: InputHandlers = {}): () => void {
  const ptrs = new Map<number, { x: number; y: number }>();
  let moved = 0;
  let pinch0 = 0;
  let D0 = 0;
  let pressT: ReturnType<typeof setTimeout> | null = null;
  const scale = () => {
    const r = canvas.getBoundingClientRect();
    return r.height / logicalH();
  };
  const ndc = (e: PointerEvent) => {
    const r = canvas.getBoundingClientRect();
    return new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  };
  const down = (e: PointerEvent) => {
    try {
      canvas.setPointerCapture(e.pointerId);
    } catch {
      /* 일부 웹뷰·합성 이벤트는 캡처를 못 한다 */
    }
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (ptrs.size === 1) {
      moved = 0;
      const p = ndc(e);
      if (h.onLongPress) pressT = setTimeout(() => moved < 8 && ptrs.size === 1 && h.onLongPress!(p), 500);
    }
    if (ptrs.size === 2) {
      const [a, b] = [...ptrs.values()] as [{ x: number; y: number }, { x: number; y: number }];
      pinch0 = Math.hypot(a.x - b.x, a.y - b.y);
      D0 = getRig().D;
    }
  };
  const move = (e: PointerEvent) => {
    const p = ptrs.get(e.pointerId);
    const rig = getRig();
    if (!p || rig.lock) return;
    const dx = e.clientX - p.x;
    const dy = e.clientY - p.y;
    p.x = e.clientX;
    p.y = e.clientY;
    const s = scale();
    if (ptrs.size === 1) {
      moved += Math.abs(dx) + Math.abs(dy);
      rig.pan(dx / s, dy / s, logicalH());
    } else if (ptrs.size === 2) {
      const [a, b] = [...ptrs.values()] as [{ x: number; y: number }, { x: number; y: number }];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      rig.zoomTo((D0 * pinch0) / Math.max(d, 1));
      moved = 99;
    }
  };
  const up = (e: PointerEvent) => {
    if (pressT) clearTimeout(pressT);
    if (ptrs.size === 1 && moved < 8 && h.onTap) h.onTap(ndc(e));
    ptrs.delete(e.pointerId);
  };
  const cancel = (e: PointerEvent) => {
    if (pressT) clearTimeout(pressT);
    ptrs.delete(e.pointerId);
  };
  const wheel = (e: WheelEvent) => {
    const rig = getRig();
    if (rig.lock) return;
    e.preventDefault();
    rig.zoomTo(rig.D * Math.exp(e.deltaY * 0.0012));
  };
  canvas.addEventListener('pointerdown', down);
  canvas.addEventListener('pointermove', move);
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', cancel);
  canvas.addEventListener('wheel', wheel, { passive: false });
  return () => {
    canvas.removeEventListener('pointerdown', down);
    canvas.removeEventListener('pointermove', move);
    canvas.removeEventListener('pointerup', up);
    canvas.removeEventListener('pointercancel', cancel);
    canvas.removeEventListener('wheel', wheel);
  };
}
