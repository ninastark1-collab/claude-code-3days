/**
 * 3D 세계: 렌더러·후처리·장면·환경·카메라·그리기 루프를 한데 묶는다.
 * - 화면(React)은 캔버스 하나를 넘겨 World3D 를 만들고, 위에 HUD를 겹친다
 * - 게임 수치는 엔진 값만 쓴다. 이 폴더는 "보여 주기"만 한다 (src/engine 을 import 하지 않는다)
 * - 일시정지 중이거나 화면이 안 보이면 그리지 않는다 (배터리, 전달서 5장)
 */
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { PS_SCALE } from './battle/fx';
import { CamRig } from './camera';
import { Env, type TimeOfDay } from './env';
import { lerp } from './math';
import { QUALITY, type Quality } from './quality';
import { makeShared, TiltShader, type SharedUniforms } from './shaders';

/** 장면 내용 (평원 전장, 천하 지도, 도시 …). world 가 매 프레임 update 를 부른다 */
export interface Stage {
  /** 장면에 물체를 깐다 */
  build(w: World3D): void;
  /** dt = 실제 시간(초) */
  update?(dt: number, w: World3D): void;
  /** 틸트시프트 초점 띠 (지도는 넓게) */
  tilt?: { band: number; amt: number };
  dispose?(): void;
}

export interface FrameStats {
  fps: number;
  calls: number;
  triangles: number;
  textures: number;
  pixelRatio: number;
}

export class World3D {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly U: SharedUniforms = makeShared();
  readonly env: Env;
  readonly cam: CamRig;
  private composer: EffectComposer;
  private bloom: UnrealBloomPass;
  private tilt: ShaderPass;
  private stage: Stage | null = null;
  quality: Quality;
  /** 논리 크기 (844×390 기준, 세로는 화면 비율에 따라 늘어남) */
  private lw = 844;
  private lh = 390;
  private cssScale = 1;
  private raf = 0;
  private last = 0;
  private acc = 0;
  private paused = false;
  /** 멈춤 중이라도 이 시각까지는 그린다 (카메라를 끌 때) */
  private wakeUntil = 0;
  private fpsN = 0;
  private fpsT = 0;
  stats: FrameStats = { fps: 0, calls: 0, triangles: 0, textures: 0, pixelRatio: 1 };
  /** 계절 값 (0~1). 장면 쪽에서 정한다 */
  season = { snow: 0, autumn: 0 };
  onStats?: (s: FrameStats) => void;
  private onVis = () => {
    if (!document.hidden) this.last = performance.now();
  };

  constructor(
    readonly canvas: HTMLCanvasElement,
    quality: Quality,
  ) {
    this.quality = quality;
    const r = (this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' }));
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.info.autoReset = false;
    const spec = QUALITY[quality];
    this.env = new Env(this.scene, 46, spec.shadowMap);
    this.cam = new CamRig(32, this.lw / this.lh);
    this.composer = new EffectComposer(r);
    this.composer.addPass(new RenderPass(this.scene, this.cam.c));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(this.lw / 2, this.lh / 2), 0.4, 0.55, 1.6);
    this.composer.addPass(this.bloom);
    this.tilt = new ShaderPass(TiltShader);
    this.tilt.uniforms.uRes!.value = new THREE.Vector2(this.lw, this.lh);
    this.tilt.uniforms.uTint!.value = new THREE.Vector3(1, 1, 1);
    this.composer.addPass(this.tilt);
    this.composer.addPass(new OutputPass());
    this.setQuality(quality);
    document.addEventListener('visibilitychange', this.onVis);
  }

  setStage(s: Stage): void {
    this.stage?.dispose?.();
    this.stage = s;
    s.build(this);
    this.env.apply();
  }

  setQuality(q: Quality): void {
    this.quality = q;
    const spec = QUALITY[q];
    this.bloom.enabled = spec.bloom;
    this.tilt.enabled = spec.tilt || spec.bloom; // 틸트 패스는 비네트·색조도 맡으므로 보통 단계에서도 켜고 흐림만 끈다
    this.tilt.uniforms.uAmt!.value = spec.tilt ? (this.stage?.tilt?.amt ?? 4.5) : 0;
    this.env.setShadowMap(spec.shadowMap);
    this.resize(this.lw, this.lh, this.cssScale);
  }

  setTime(t: TimeOfDay, rain = this.env.rain): void {
    this.env.time = t;
    this.env.rain = rain;
    this.env.apply();
  }

  /** 논리 크기와 화면 배율(논리 1pt 당 CSS px)이 바뀌면 부른다 */
  resize(lw: number, lh: number, cssScale: number): void {
    this.lw = lw;
    this.lh = lh;
    this.cssScale = cssScale;
    const spec = QUALITY[this.quality];
    const pr = Math.min((window.devicePixelRatio || 1) * cssScale, spec.maxPixelRatio);
    this.renderer.setPixelRatio(pr);
    this.composer.setPixelRatio(pr);
    this.renderer.setSize(lw, lh, false);
    this.composer.setSize(lw, lh);
    this.cam.c.aspect = lw / lh;
    this.cam.c.updateProjectionMatrix();
    (this.tilt.uniforms.uRes!.value as THREE.Vector2).set(lw, lh);
    this.stats.pixelRatio = pr;
  }

  get logicalH(): number {
    return this.lh;
  }

  /** 그리기 멈춤 (전투 일시정지·다른 화면) */
  setPaused(p: boolean): void {
    this.paused = p;
    if (!p) this.last = performance.now();
  }

  /** 멈춤 중 화면을 만지면 잠깐 다시 그린다 */
  poke(ms = 1500): void {
    this.wakeUntil = performance.now() + ms;
  }

  start(): void {
    if (this.raf) return;
    this.last = performance.now();
    const frame = (now: number) => {
      this.raf = requestAnimationFrame(frame);
      const dt = Math.min(0.05, (now - this.last) / 1000);
      // 절약 단계는 30fps
      const minDt = 1 / QUALITY[this.quality].fps - 0.002;
      this.acc += dt;
      this.last = now;
      if ((this.paused && now > this.wakeUntil) || document.hidden || this.acc < minDt) return;
      const step = Math.min(0.05, this.acc);
      this.acc = 0;
      this.tick(step);
    };
    this.raf = requestAnimationFrame(frame);
  }

  stop(): void {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  /** 한 프레임 진행 + 그리기 (시험용으로 직접 부를 수 있다) */
  tick(dt: number): void {
    const U = this.U;
    U.time.value += dt;
    const k = Math.min(1, dt * 1.2);
    U.snow.value = lerp(U.snow.value, this.season.snow, k);
    U.autumn.value = lerp(U.autumn.value, this.season.autumn, k);
    U.wet.value = lerp(U.wet.value, this.env.wetTarget, k);
    U.cloud.value = lerp(U.cloud.value, this.env.cloudTarget, k);
    PS_SCALE.value = (this.stats.pixelRatio * this.lh) / (2 * Math.tan((this.cam.c.fov * Math.PI) / 360));
    this.stage?.update?.(dt, this);
    this.cam.update(dt);
    this.env.follow(this.cam.t, this.cam.c.position);
    this.renderer.toneMappingExposure = this.env.exp;
    this.bloom.strength = this.env.bloom;
    (this.tilt.uniforms.uTint!.value as THREE.Vector3).set(...this.env.tint);
    const t = this.stage?.tilt;
    this.tilt.uniforms.uBand!.value = t?.band ?? 0.17;
    if (QUALITY[this.quality].tilt) this.tilt.uniforms.uAmt!.value = this.cam.lock ? 6 : (t?.amt ?? 4.5);
    this.renderer.info.reset();
    this.composer.render();
    const info = this.renderer.info;
    this.fpsN++;
    this.fpsT += dt;
    if (this.fpsT >= 1) {
      this.stats = {
        fps: Math.round(this.fpsN / this.fpsT),
        calls: info.render.calls,
        triangles: info.render.triangles,
        textures: info.memory.textures,
        pixelRatio: this.stats.pixelRatio,
      };
      this.fpsN = 0;
      this.fpsT = 0;
      this.onStats?.(this.stats);
    }
  }

  dispose(): void {
    this.stop();
    document.removeEventListener('visibilitychange', this.onVis);
    this.stage?.dispose?.();
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose();
      const mat = m.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
      else mat?.dispose();
    });
    this.composer.dispose();
    this.renderer.dispose();
  }
}
