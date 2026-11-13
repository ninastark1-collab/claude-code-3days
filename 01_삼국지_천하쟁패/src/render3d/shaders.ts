/**
 * 표준 재질에 덧붙이는 셰이더 조각 (시안의 patchTerrain·patchWind·patchWater).
 * 지형 잡음 색, 가을·눈·젖은 땅, 흐르는 구름 그림자, 바람에 흔들리는 풀·나무, 물결.
 */
import type * as THREE from 'three';

/** 장면 전체가 같이 쓰는 셰이더 값. world 가 매 프레임 값을 바꾼다 */
export interface SharedUniforms {
  time: { value: number };
  snow: { value: number };
  autumn: { value: number };
  wet: { value: number };
  cloud: { value: number };
}
export const makeShared = (): SharedUniforms => ({ time: { value: 0 }, snow: { value: 0 }, autumn: { value: 0 }, wet: { value: 0 }, cloud: { value: 1 } });

const NOISE_GLSL = `
float h21(vec2 p){ p=fract(p*vec2(123.34,456.21)); p+=dot(p,p+45.32); return fract(p.x*p.y); }
float vn(vec2 p){ vec2 i=floor(p), f=fract(p); vec2 u=f*f*(3.-2.*f);
  return mix(mix(h21(i),h21(i+vec2(1.,0.)),u.x), mix(h21(i+vec2(0.,1.)),h21(i+vec2(1.,1.)),u.x), u.y); }
`;

export function patchTerrain(mat: THREE.MeshStandardMaterial, U: SharedUniforms, key: string): void {
  mat.customProgramCacheKey = () => 'terrain' + key;
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, { uTime: U.time, uSnow: U.snow, uAutumn: U.autumn, uWet: U.wet, uCloud: U.cloud });
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWP; varying vec3 vWN;')
      .replace('#include <fog_vertex>', '#include <fog_vertex>\n vWP=(modelMatrix*vec4(transformed,1.)).xyz; vWN=normalize(mat3(modelMatrix)*objectNormal);');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWP; varying vec3 vWN; uniform float uTime,uSnow,uAutumn,uWet,uCloud;\n' + NOISE_GLSL)
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        float n1=vn(vWP.xz*.22), n2=vn(vWP.xz*1.1), n3=vn(vWP.xz*4.3);
        float nn=n1*.5+n2*.32+n3*.18;
        diffuseColor.rgb *= .8+.4*nn;
        vec3 gc=diffuseColor.rgb; float green=clamp((gc.g-max(gc.r,gc.b))*7.,0.,1.);
        diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb*vec3(1.7,.95,.42)+vec3(.03,.01,0.), uAutumn*green);
        float up=clamp(vWN.y,0.,1.);
        float snowM=uSnow*smoothstep(.45,.8,up)*smoothstep(.2,.5,nn+.12);
        diffuseColor.rgb=mix(diffuseColor.rgb, vec3(.86,.89,.95), snowM);
        diffuseColor.rgb*=mix(1.,.62,uWet);
        float cl=smoothstep(.5,.8, vn(vWP.xz*.018+vec2(uTime*.012,uTime*.005))*.7+vn(vWP.xz*.05+vec2(uTime*.02,0.))*.3);
        diffuseColor.rgb*=1.-cl*.3*uCloud;`,
      )
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n roughnessFactor=mix(roughnessFactor,.3,uWet);');
  };
}

export function patchWind(mat: THREE.MeshStandardMaterial, U: SharedUniforms, amp: number, key: string): void {
  mat.customProgramCacheKey = () => 'wind' + key;
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = U.time;
    sh.uniforms.uSnow = U.snow;
    sh.uniforms.uAutumn = U.autumn;
    sh.vertexShader =
      'uniform float uTime;\n' +
      sh.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
      vec3 ip=vec3(0.);
      #ifdef USE_INSTANCING
      ip=instanceMatrix[3].xyz;
      #endif
      float sw=sin(uTime*1.7+ip.x*.37+ip.z*.29)+.45*sin(uTime*3.1+ip.z*.8+ip.x*.2);
      float hh=max(position.y,0.);
      transformed.x+=sw*${amp.toFixed(3)}*hh; transformed.z+=sw*${(amp * 0.55).toFixed(3)}*hh;`,
      );
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uSnow,uAutumn;').replace(
      '#include <color_fragment>',
      `#include <color_fragment>
        vec3 gc=diffuseColor.rgb; float green=clamp((gc.g-max(gc.r,gc.b))*7.,0.,1.);
        diffuseColor.rgb=mix(diffuseColor.rgb, diffuseColor.rgb*vec3(2.1,1.0,.35)+vec3(.04,.01,0.), uAutumn*green);
        diffuseColor.rgb=mix(diffuseColor.rgb, vec3(.82,.86,.92), uSnow*.55);`,
    );
  };
}

export function patchWater(mat: THREE.MeshStandardMaterial, U: SharedUniforms): void {
  mat.customProgramCacheKey = () => 'water';
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = U.time;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWP2;')
      .replace('#include <fog_vertex>', '#include <fog_vertex>\nvWP2=(modelMatrix*vec4(transformed,1.)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWP2; uniform float uTime;\n' + NOISE_GLSL)
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
        vec2 wp=vWP2.xz;
        float a=vn(wp*.6+vec2(uTime*.25,uTime*.1)), b=vn(wp*.6+vec2(-uTime*.18,uTime*.22)+3.1), c=vn(wp*2.3+vec2(uTime*.4,-uTime*.3));
        normal=normalize(normal+(viewMatrix*vec4(vec3(a-b,0.,b-c)*.5,0.)).xyz);`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        float fo=vn(vWP2.xz*1.5+vec2(uTime*.3,0.)); diffuseColor.rgb+=vec3(.05,.07,.08)*smoothstep(.7,.95,fo);`,
      );
  };
}

/** 틸트시프트 + 비네트 + 색조 (디오라마 느낌, 설계 원칙 景) */
export const TiltShader = {
  uniforms: {
    tDiffuse: { value: null },
    uRes: { value: null as unknown },
    uFocus: { value: 0.5 },
    uBand: { value: 0.17 },
    uAmt: { value: 4.5 },
    uVig: { value: 0.32 },
    uTint: { value: null as unknown },
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
  fragmentShader: `uniform sampler2D tDiffuse; uniform vec2 uRes; uniform float uFocus,uBand,uAmt,uVig; uniform vec3 uTint; varying vec2 vUv;
  void main(){
    float d=abs(vUv.y-uFocus); float b=smoothstep(uBand,uBand+.32,d)*uAmt;
    vec4 c=texture2D(tDiffuse,vUv);
    if(b>.05){ vec4 acc=c; float n=1.;
      for(int i=1;i<14;i++){ float fi=float(i); float a=fi*2.39996; float r=sqrt(fi/13.); acc+=texture2D(tDiffuse,vUv+vec2(cos(a),sin(a))*r*b/uRes); n+=1.; }
      c=acc/n; }
    vec2 q=vUv-.5; q.x*=uRes.x/uRes.y*.55; c.rgb*=clamp(1.-dot(q,q)*uVig*2.,0.,1.);
    c.rgb*=uTint; gl_FragColor=c; }`,
};
