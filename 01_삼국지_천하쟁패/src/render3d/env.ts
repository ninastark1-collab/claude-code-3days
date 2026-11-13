/**
 * 하늘·해·반구광·안개와 시간대(낮·노을·밤), 비 (시안 makeEnv)
 */
import * as THREE from 'three';

export type TimeOfDay = 'day' | 'dusk' | 'night';

interface TimePreset {
  sun: number;
  si: number;
  dir: [number, number, number];
  top: number;
  hs: number;
  hg: number;
  hi: number;
  fog: number;
  exp: number;
  tint: [number, number, number];
  lamp: number;
  bloom: number;
  cloud: number;
}

export const TIMES: Record<TimeOfDay, TimePreset> = {
  day: { sun: 0xfff0d8, si: 2.8, dir: [-0.45, 0.8, 0.42], top: 0x7fb0dc, hs: 0xc4dcf5, hg: 0x6d5a3a, hi: 1.05, fog: 0xd6e2e2, exp: 1.0, tint: [1, 0.99, 0.96], lamp: 0.15, bloom: 0.35, cloud: 1 },
  dusk: { sun: 0xff9a55, si: 2.4, dir: [-0.85, 0.3, 0.42], top: 0x4d5788, hs: 0xf0a27a, hg: 0x45304a, hi: 0.75, fog: 0xd6977a, exp: 1.05, tint: [1.06, 0.95, 0.9], lamp: 0.7, bloom: 0.5, cloud: 0.6 },
  night: { sun: 0x9db4ff, si: 0.6, dir: [0.3, 0.85, -0.35], top: 0x070d1c, hs: 0x2c3c60, hg: 0x0c0d12, hi: 0.55, fog: 0x141c2e, exp: 1.2, tint: [0.92, 0.97, 1.1], lamp: 1, bloom: 0.75, cloud: 0 },
};
export const TIME_NAME: Record<TimeOfDay, string> = { day: '낮', dusk: '노을', night: '밤' };

export class Env {
  readonly hemi: THREE.HemisphereLight;
  readonly sun: THREE.DirectionalLight;
  readonly sky: THREE.Mesh;
  private skyU = { uTop: { value: new THREE.Color() }, uHor: { value: new THREE.Color() } };
  readonly sunDir = new THREE.Vector3();
  time: TimeOfDay = 'day';
  rain = false;
  /** 렌더러가 읽는 값 */
  exp = 1;
  lamp = 0;
  bloom = 0.35;
  tint: [number, number, number] = [1, 1, 1];
  /** 셰이더 목표값 (world 가 천천히 따라간다) */
  wetTarget = 0;
  cloudTarget = 1;
  fogNear = 75;
  fogFar = 240;

  constructor(
    private scene: THREE.Scene,
    shadowSize: number,
    shadowMap = 2048,
  ) {
    this.hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1);
    scene.add(this.hemi);
    const sun = (this.sun = new THREE.DirectionalLight(0xffffff, 2.5));
    sun.castShadow = true;
    sun.shadow.mapSize.set(shadowMap, shadowMap);
    Object.assign(sun.shadow.camera, { left: -shadowSize, right: shadowSize, top: shadowSize, bottom: -shadowSize, near: 1, far: 420 });
    sun.shadow.bias = -0.0005;
    sun.shadow.normalBias = 0.04;
    scene.add(sun, sun.target);
    this.sky = new THREE.Mesh(
      new THREE.SphereGeometry(600, 32, 16),
      new THREE.ShaderMaterial({
        uniforms: this.skyU,
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
        vertexShader: `varying vec3 vD; void main(){ vD=normalize(position); vec4 p=projectionMatrix*modelViewMatrix*vec4(position,1.); gl_Position=p.xyww; }`,
        fragmentShader: `uniform vec3 uTop,uHor; varying vec3 vD; void main(){ float h=clamp(vD.y,0.,1.); gl_FragColor=vec4(mix(uHor,uTop,pow(h,.5)),1.); }`,
      }),
    );
    this.sky.renderOrder = -10;
    this.sky.frustumCulled = false;
    scene.add(this.sky);
    scene.fog = new THREE.Fog(0xffffff, 80, 260);
    this.apply();
  }

  setShadowMap(size: number): void {
    if (this.sun.shadow.mapSize.x === size) return;
    this.sun.shadow.mapSize.set(size, size);
    this.sun.shadow.map?.dispose();
    this.sun.shadow.map = null as unknown as THREE.WebGLRenderTarget;
  }

  apply(): void {
    const p = TIMES[this.time];
    const r = this.rain;
    this.sun.color.setHex(p.sun);
    this.sun.intensity = p.si * (r ? 0.4 : 1);
    this.sunDir.set(...p.dir).normalize();
    this.hemi.color.setHex(p.hs);
    this.hemi.groundColor.setHex(p.hg);
    this.hemi.intensity = p.hi * (r ? 0.85 : 1);
    const fog = new THREE.Color(p.fog);
    if (r) fog.lerp(new THREE.Color(0x7d858c), this.time === 'night' ? 0.2 : 0.55);
    const f = this.scene.fog as THREE.Fog;
    f.color.copy(fog);
    f.near = this.fogNear * (r ? 0.55 : 1);
    f.far = this.fogFar * (r ? 0.7 : 1);
    this.skyU.uTop.value.setHex(p.top);
    this.skyU.uHor.value.copy(fog);
    if (r) this.skyU.uTop.value.lerp(new THREE.Color(0x5d656e), this.time === 'night' ? 0.1 : 0.6);
    this.exp = p.exp;
    this.lamp = p.lamp;
    this.tint = p.tint;
    this.bloom = p.bloom;
    this.wetTarget = r ? 1 : 0;
    this.cloudTarget = r ? 0.2 : p.cloud;
  }

  /** 그림자 범위가 카메라 초점을 따라가게 한다 */
  follow(target: THREE.Vector3, camPos: THREE.Vector3): void {
    this.sun.position.copy(target).addScaledVector(this.sunDir, 160);
    this.sun.target.position.copy(target);
    this.sky.position.copy(camPos);
  }
}
