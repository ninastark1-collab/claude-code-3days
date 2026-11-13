/** 3D 화면 공용 수학·잡음 (design/battle-3d.html 시안에서 옮김) */
export const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const smooth = (e0: number, e1: number, x: number) => {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};
export const ease = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
export type RGB = [number, number, number];
export const mixC = (a: RGB, b: RGB, t: number): RGB => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];

export function hash2(x: number, y: number): number {
  const h = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123;
  return h - Math.floor(h);
}
export function vnoise(x: number, y: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi);
  const b = hash2(xi + 1, yi);
  const c = hash2(xi, yi + 1);
  const d = hash2(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
export function fbm(x: number, y: number, o = 4): number {
  let s = 0;
  let a = 0.5;
  let f = 1;
  let n = 0;
  for (let i = 0; i < o; i++) {
    s += a * vnoise(x * f, y * f);
    n += a;
    f *= 2.03;
    a *= 0.5;
  }
  return s / n;
}

/**
 * 시드 고정 난수 (장면이 매번 같게 보이도록; 엔진 RNG와는 별개이고 게임 결과에 쓰지 않는다)
 */
export function seeded(seed: number): (a?: number, b?: number) => number {
  let s = seed >>> 0 || 1;
  return (a = 0, b = 1) => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return a + ((s >>> 0) / 4294967296) * (b - a);
  };
}
