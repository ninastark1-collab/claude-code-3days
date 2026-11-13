/**
 * BGM 합성기 (순수 JS, 외부 음원 파일 없음)
 *
 * - 악보(score.ts)를 받아 스테레오 Float32Array 두 개로 렌더링한다.
 * - DOM/WebAudio에 의존하지 않으므로 Node(미리듣기 WAV 출력·테스트)와 게임 양쪽에서 같은 소리가 난다.
 * - 악기는 전부 이 파일에서 직접 합성한다: 쟁·비파·금(발현), 이호·첼로·현악 패드(찰현),
 *   적·소·쇄납(관), 편종, 대고·당고·방자·대라·소라·요발(타악).
 */

export type Inst =
  | 'zheng' // 쟁: 밝은 발현, 긴 여음
  | 'pipa' // 비파: 짧고 단단한 발현
  | 'qin' // 금: 낮고 어두운 발현
  | 'erhu' // 이호: 비음 섞인 찰현, 꺾는 소리
  | 'cello' // 낮은 현 (저음 받침)
  | 'pad' // 현악 합주 패드
  | 'dizi' // 적: 밝은 횡적
  | 'xiao' // 소: 부드러운 종적
  | 'suona' // 쇄납: 날카로운 겹리드 (군악)
  | 'bell' // 편종
  | 'taiko' // 대고 (큰 북)
  | 'tom' // 당고 (중간 북)
  | 'block' // 방자 (나무 딱따기)
  | 'gong' // 대라 (큰 징, 길게 울림)
  | 'luo' // 소라 (경극 작은 징, 음이 올라감)
  | 'cymbal'; // 요발

export const DRUMS: ReadonlySet<Inst> = new Set<Inst>(['taiko', 'tom', 'block', 'gong', 'luo', 'cymbal']);

/** 렌더링할 음 하나 (시간 단위: 초) */
export interface Voice {
  inst: Inst;
  /** 시작 (초) */
  t: number;
  /** 길이 (초) */
  dur: number;
  /** 주파수 (Hz). 타악기는 무시하거나 음색 보정에 씀 */
  freq: number;
  /** 세기 0~1 */
  vel: number;
  /** 바로 앞 음의 주파수: 이호·적의 미끄러짐(portamento)용 */
  from?: number;
  /** 아래에서 꺾어 올라오는 장식음 */
  slide?: boolean;
  /** 발현 악기 트레몰로 (윤지) */
  trem?: boolean;
}

export interface PartMix {
  vol: number;
  /** -1(왼쪽) ~ 1(오른쪽) */
  pan: number;
  /** 잔향 보내기 0~1 */
  rev: number;
  voices: Voice[];
}

export interface RenderSpec {
  sr: number;
  /** 루프 길이 (초). loop=false면 내용 길이 */
  length: number;
  loop: boolean;
  /** 잔향 공간 크기 0~1 */
  room: number;
  parts: PartMix[];
  /** 목표 RMS (dBFS). 곡마다 체감 음량을 맞춘다 */
  targetDb?: number;
}

export interface Rendered {
  sr: number;
  left: Float32Array;
  right: Float32Array;
  loop: boolean;
  peak: number;
  rmsDb: number;
}

const TAU = Math.PI * 2;

// ─── 파형표 ──────────────────────────────────────────────
const TABLE = 2048;
const SINE = (() => {
  const t = new Float32Array(TABLE + 1);
  for (let i = 0; i <= TABLE; i++) t[i] = Math.sin((i / TABLE) * TAU);
  return t;
})();

function makeTable(amps: number[]): Float32Array {
  const t = new Float32Array(TABLE + 1);
  let peak = 0;
  for (let i = 0; i < TABLE; i++) {
    let v = 0;
    for (let k = 0; k < amps.length; k++) v += (amps[k] ?? 0) * Math.sin(((k + 1) * i * TAU) / TABLE);
    t[i] = v;
    peak = Math.max(peak, Math.abs(v));
  }
  for (let i = 0; i < TABLE; i++) t[i] = (t[i] ?? 0) / peak;
  t[TABLE] = t[0] ?? 0;
  return t;
}

/** 배음 비율: 악기 성격을 정한다 */
const TABLES = {
  erhu: makeTable([1, 0.75, 0.6, 0.52, 0.42, 0.33, 0.27, 0.2, 0.15, 0.11, 0.08, 0.06, 0.04]),
  cello: makeTable([1, 0.55, 0.35, 0.25, 0.18, 0.12, 0.08, 0.05]),
  saw: makeTable(Array.from({ length: 14 }, (_, k) => 1 / (k + 1))),
  dizi: makeTable([1, 0.38, 0.16, 0.08, 0.04]),
  xiao: makeTable([1, 0.14, 0.05]),
  suona: makeTable([1, 0.95, 0.9, 0.85, 0.75, 0.65, 0.55, 0.48, 0.4, 0.32, 0.25, 0.2, 0.15, 0.11, 0.08]),
};

function lookup(tab: Float32Array, phase: number): number {
  const p = (phase - Math.floor(phase)) * TABLE;
  const i = p | 0;
  const f = p - i;
  const a = tab[i] ?? 0;
  return a + ((tab[i + 1] ?? 0) - a) * f;
}

// ─── 결정적 잡음 (같은 악보면 늘 같은 소리) ─────────────────
function rng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) / 4294967296) * 2 - 1;
  };
}

// ─── 발현 악기 (가산 합성: 배음마다 감쇠가 다르다) ─────────────
interface PluckParams {
  partials: number;
  /** 뜯는 위치 (0~0.5): 작을수록 밝다 */
  pos: number;
  /** 기음 감쇠 시간 (초) */
  decay: number;
  /** 고배음 감쇠 가속 */
  hf: number;
  /** 줄 누르기 비브라토 (긴 음) */
  vib: number;
  gain: number;
}
const PLUCK: Record<'zheng' | 'pipa' | 'qin', PluckParams> = {
  zheng: { partials: 10, pos: 0.13, decay: 2.6, hf: 0.55, vib: 0.006, gain: 0.55 },
  pipa: { partials: 12, pos: 0.09, decay: 0.9, hf: 0.8, vib: 0.004, gain: 0.5 },
  qin: { partials: 7, pos: 0.21, decay: 3.8, hf: 0.9, vib: 0.009, gain: 0.7 },
};

function pluck(out: Float32Array, sr: number, v: Voice, p: PluckParams, start: number, maxLen: number, vel: number, seed: number): void {
  // 손으로 막은 뒤 1.2초면 충분히 사라진다 (e^-5)
  const len = Math.min(maxLen, Math.floor(Math.min(p.decay * 2.2, v.dur + 0.95) * sr));
  const amps: number[] = [];
  const env = new Float64Array(p.partials);
  const mul = new Float64Array(p.partials);
  const harm = new Float64Array(p.partials);
  const ny = sr * 0.45;
  for (let k = 1; k <= p.partials; k++) {
    if (v.freq * k * 1.002 > ny) break;
    amps.push(Math.abs(Math.sin(Math.PI * k * p.pos)) / Math.pow(k, 0.9));
    env[k - 1] = 1;
    mul[k - 1] = Math.exp(-1 / (sr * (p.decay / (1 + p.hf * (k - 1) * (v.freq / 330)))));
    harm[k - 1] = k * (1 + 0.0004 * (k - 1) * (k - 1));
  }
  let np = amps.length;
  const rnd = rng(seed);
  const relAt = Math.floor((v.dur + 0.05) * sr);
  const relMul = Math.exp(-1 / (0.2 * sr));
  let rel = 1;
  let phase = 0;
  for (let n = 0; n < len; n++) {
    const t = n / sr;
    const vib = t > 0.35 ? 1 + p.vib * Math.sin(TAU * 5 * t) * Math.min(1, (t - 0.35) * 3) : 1;
    phase += (v.freq * vib) / sr;
    if (phase > 1000) phase -= 1000;
    // 높은 배음이 먼저 사라지므로 다 꺼진 배음은 계산에서 뺀다
    while (np > 1 && (env[np - 1] ?? 0) < 2e-4) np--;
    let s = 0;
    for (let k = 0; k < np; k++) {
      const e = (env[k] ?? 0) * (mul[k] ?? 0);
      env[k] = e;
      s += (amps[k] ?? 0) * e * lookup(SINE, phase * (harm[k] ?? 1));
    }
    // 뜯는 순간 손톱 소리
    if (n < 0.006 * sr) s += rnd() * 0.25 * (1 - n / (0.006 * sr));
    let a = n < 0.002 * sr ? n / (0.002 * sr) : 1;
    // 다음 음이 오기 전 손으로 막는 소리 (긴 여음은 남긴다)
    if (n > relAt) a *= rel *= relMul;
    out[start + n] = (out[start + n] ?? 0) + s * a * vel * p.gain;
  }
}

// ─── 지속음 악기 (파형표 + 엔벨로프 + 비브라토) ─────────────────
interface SustainParams {
  tab: Float32Array;
  attack: number;
  release: number;
  vibRate: number;
  /** 비브라토 깊이 (반음 비율, 0.01 ≈ 17센트) */
  vibDepth: number;
  vibDelay: number;
  /** 숨·활 잡음 */
  noise: number;
  /** 한 극 저역 통과 (0~1, 클수록 밝다) */
  bright: number;
  /** 미끄러짐 시간 (초) */
  glide: number;
  /** 시작 음 낮게 들어가기 (반음 비율) */
  scoop: number;
  gain: number;
  /** 겹쳐 쌓을 음 수 (합주 효과) */
  unison: number;
  detune: number;
}
const SUSTAIN: Record<'erhu' | 'cello' | 'pad' | 'dizi' | 'xiao' | 'suona', SustainParams> = {
  erhu: { tab: TABLES.erhu, attack: 0.06, release: 0.14, vibRate: 5.6, vibDepth: 0.012, vibDelay: 0.18, noise: 0.025, bright: 0.42, glide: 0.09, scoop: 0, gain: 0.42, unison: 1, detune: 0 },
  cello: { tab: TABLES.cello, attack: 0.1, release: 0.25, vibRate: 5, vibDepth: 0.005, vibDelay: 0.3, noise: 0.01, bright: 0.18, glide: 0.05, scoop: 0, gain: 0.5, unison: 1, detune: 0 },
  pad: { tab: TABLES.saw, attack: 0.55, release: 0.8, vibRate: 4.5, vibDepth: 0.002, vibDelay: 0, noise: 0, bright: 0.12, glide: 0, scoop: 0, gain: 0.16, unison: 3, detune: 0.0045 },
  dizi: { tab: TABLES.dizi, attack: 0.035, release: 0.09, vibRate: 5.2, vibDepth: 0.009, vibDelay: 0.2, noise: 0.05, bright: 0.5, glide: 0.05, scoop: 0, gain: 0.38, unison: 1, detune: 0 },
  xiao: { tab: TABLES.xiao, attack: 0.12, release: 0.22, vibRate: 4.6, vibDepth: 0.007, vibDelay: 0.3, noise: 0.07, bright: 0.25, glide: 0.08, scoop: 0, gain: 0.45, unison: 1, detune: 0 },
  suona: { tab: TABLES.suona, attack: 0.025, release: 0.08, vibRate: 6.2, vibDepth: 0.014, vibDelay: 0.12, noise: 0.02, bright: 0.55, glide: 0.06, scoop: 0.035, gain: 0.3, unison: 1, detune: 0 },
};

function sustain(out: Float32Array, sr: number, v: Voice, p: SustainParams, start: number, maxLen: number, vel: number, seed: number): void {
  const relN = Math.floor(p.release * sr);
  const bodyN = Math.max(1, Math.floor(v.dur * sr));
  const len = Math.min(maxLen, bodyN + relN);
  const rnd = rng(seed);
  const atkN = Math.max(1, Math.floor(p.attack * sr));
  const glideN = Math.floor(p.glide * sr);
  const slideN = Math.floor(0.11 * sr);
  const phases = new Float64Array(p.unison);
  for (let u = 0; u < p.unison; u++) phases[u] = (u * 0.37) % 1;
  let lp = 0;
  let nlp = 0;
  const vibPhase0 = (seed % 100) / 100;
  for (let n = 0; n < len; n++) {
    const t = n / sr;
    // 음높이 곡선: 앞 음에서 미끄러짐 → 아래에서 꺾어 올리기 → 들어가며 살짝 낮게 → 비브라토
    let ratio = 1;
    if (v.from && n < glideN) ratio = Math.pow(v.from / v.freq, 1 - n / glideN);
    else if (v.slide && n < slideN) ratio = Math.pow(2, (-2 / 12) * (1 - n / slideN));
    if (p.scoop > 0 && n < 0.06 * sr) ratio *= 1 - p.scoop * (1 - n / (0.06 * sr));
    if (t > p.vibDelay) {
      const ramp = Math.min(1, (t - p.vibDelay) * 2.5);
      ratio *= 1 + p.vibDepth * ramp * Math.sin(TAU * (p.vibRate * t + vibPhase0));
    }
    const f = v.freq * ratio;
    let s = 0;
    for (let u = 0; u < p.unison; u++) {
      const d = p.unison === 1 ? 1 : 1 + p.detune * (u - (p.unison - 1) / 2);
      const ph = (phases[u] ?? 0) + (f * d) / sr;
      phases[u] = ph - Math.floor(ph);
      s += lookup(p.tab, ph);
    }
    s /= p.unison;
    // 활·숨 잡음 (음높이 근처를 대충 따라가는 저역 잡음)
    if (p.noise > 0) {
      nlp += (rnd() - nlp) * 0.25;
      s += nlp * p.noise * 4;
    }
    // 음색: 첫머리는 밝고 이어서 가라앉는다 (활 힘)
    const b = p.bright * (n < atkN * 2 ? 1.4 : 1);
    lp += (s - lp) * Math.min(1, b);
    let env = n < atkN ? n / atkN : 1;
    if (n >= bodyN) env *= Math.max(0, 1 - (n - bodyN) / relN);
    out[start + n] = (out[start + n] ?? 0) + lp * env * vel * p.gain;
  }
}

// ─── 편종 ───────────────────────────────────────────────
function bell(out: Float32Array, sr: number, v: Voice, start: number, maxLen: number, vel: number): void {
  const ratios = [1, 2.0, 2.76, 4.07, 5.4];
  const amps = [1, 0.45, 0.55, 0.25, 0.15];
  const decays = [3.2, 2.2, 1.4, 0.8, 0.5];
  const len = Math.min(maxLen, Math.floor(3.5 * sr));
  for (let k = 0; k < ratios.length; k++) {
    const f = v.freq * (ratios[k] ?? 1);
    if (f > sr * 0.45) continue;
    const a = (amps[k] ?? 0) * vel * 0.32;
    const r = 1 / ((decays[k] ?? 1) * sr);
    for (let n = 0; n < len; n++) {
      const atk = n < 0.003 * sr ? n / (0.003 * sr) : 1;
      out[start + n] = (out[start + n] ?? 0) + a * atk * Math.exp(-n * r) * lookup(SINE, (f * n) / sr);
    }
  }
}

// ─── 타악기 ─────────────────────────────────────────────
function drum(out: Float32Array, sr: number, v: Voice, start: number, maxLen: number, vel: number, seed: number): void {
  const rnd = rng(seed);
  const put = (n: number, s: number) => {
    out[start + n] = (out[start + n] ?? 0) + s * vel;
  };
  switch (v.inst) {
    case 'taiko': {
      const len = Math.min(maxLen, Math.floor(1.0 * sr));
      let ph = 0;
      let ph2 = 0;
      let lp = 0;
      for (let n = 0; n < len; n++) {
        const t = n / sr;
        const f = 52 + 95 * Math.exp(-t / 0.035);
        ph += f / sr;
        ph2 += (f * 1.58) / sr;
        lp += (rnd() - lp) * 0.08;
        const body = lookup(SINE, ph) * Math.exp(-t / 0.42) + 0.35 * lookup(SINE, ph2) * Math.exp(-t / 0.16);
        const skin = lp * 2.2 * Math.exp(-t / 0.02);
        put(n, (body + skin) * 0.95);
      }
      break;
    }
    case 'tom': {
      const len = Math.min(maxLen, Math.floor(0.6 * sr));
      let ph = 0;
      let lp = 0;
      for (let n = 0; n < len; n++) {
        const t = n / sr;
        ph += (115 + 140 * Math.exp(-t / 0.02)) / sr;
        lp += (rnd() - lp) * 0.2;
        put(n, (lookup(SINE, ph) * Math.exp(-t / 0.18) + lp * 1.2 * Math.exp(-t / 0.012)) * 0.7);
      }
      break;
    }
    case 'block': {
      const len = Math.min(maxLen, Math.floor(0.12 * sr));
      for (let n = 0; n < len; n++) {
        const t = n / sr;
        const s = lookup(SINE, 1450 * t) * 0.8 + lookup(SINE, 2380 * t) * 0.35;
        put(n, s * Math.exp(-t / 0.028) * 0.45);
      }
      break;
    }
    case 'gong': {
      // 대라: 비조화 배음, 높은 배음이 천천히 부풀었다 사라진다
      const base = 92;
      const ratios = [1, 1.47, 1.98, 2.52, 3.13, 3.71, 4.43, 5.18];
      const len = Math.min(maxLen, Math.floor(5.5 * sr));
      for (let k = 0; k < ratios.length; k++) {
        const f = base * (ratios[k] ?? 1);
        const a = 0.32 / (1 + k * 0.45);
        const dec = 3.6 / (1 + k * 0.25);
        const swell = 0.05 + k * 0.09;
        for (let n = 0; n < len; n++) {
          const t = n / sr;
          const e = (1 - Math.exp(-t / swell)) * Math.exp(-t / dec);
          // 큰 징은 울리며 음이 살짝 내려간다
          put(n, a * e * lookup(SINE, f * (t - 0.004 * t * t)));
        }
      }
      let lp = 0;
      for (let n = 0; n < Math.min(len, 0.05 * sr); n++) {
        lp += (rnd() - lp) * 0.3;
        put(n, lp * 0.6 * (1 - n / (0.05 * sr)));
      }
      break;
    }
    case 'luo': {
      // 소라: 쳐 놓으면 음이 위로 휜다 (경극 특유의 "짱~")
      const len = Math.min(maxLen, Math.floor(1.1 * sr));
      let ph = 0;
      let ph2 = 0;
      for (let n = 0; n < len; n++) {
        const t = n / sr;
        const f = 520 * (1 + 0.12 * (1 - Math.exp(-t / 0.15)));
        ph += f / sr;
        ph2 += (f * 2.31) / sr;
        put(n, (lookup(SINE, ph) + 0.4 * lookup(SINE, ph2)) * Math.exp(-t / 0.35) * 0.22);
      }
      break;
    }
    case 'cymbal': {
      const len = Math.min(maxLen, Math.floor(1.6 * sr));
      let prev = 0;
      let hp = 0;
      for (let n = 0; n < len; n++) {
        const t = n / sr;
        const x = rnd();
        hp = 0.85 * (hp + x - prev);
        prev = x;
        const ring = lookup(SINE, 3170 * t) * 0.15 + lookup(SINE, 4610 * t) * 0.1;
        put(n, (hp * 0.3 + ring) * Math.exp(-t / 0.45) * 0.5);
      }
      break;
    }
    default:
      break;
  }
}

function renderVoice(out: Float32Array, sr: number, v: Voice, seed: number): void {
  const start = Math.max(0, Math.floor(v.t * sr));
  const maxLen = out.length - start;
  if (maxLen <= 0) return;
  const vel = v.vel;
  switch (v.inst) {
    case 'zheng':
    case 'pipa':
    case 'qin': {
      const p = PLUCK[v.inst];
      if (v.trem) {
        // 윤지: 같은 음을 빠르게 거듭 뜯는다
        const step = v.inst === 'pipa' ? 1 / 14 : 1 / 11;
        const n = Math.max(1, Math.floor(v.dur / step));
        for (let i = 0; i < n; i++) {
          const sub: Voice = { ...v, t: v.t + i * step, dur: step * 0.9, trem: false };
          const s0 = Math.floor(sub.t * sr);
          if (s0 >= out.length) break;
          const last = i === n - 1;
          pluck(out, sr, last ? { ...sub, dur: step } : sub, { ...p, decay: last ? p.decay : 0.25 }, s0, out.length - s0, vel * (i % 2 ? 0.7 : 0.85), seed + i);
        }
      } else pluck(out, sr, v, p, start, maxLen, vel, seed);
      break;
    }
    case 'erhu':
    case 'cello':
    case 'pad':
    case 'dizi':
    case 'xiao':
    case 'suona':
      sustain(out, sr, v, SUSTAIN[v.inst], start, maxLen, vel, seed);
      break;
    case 'bell':
      bell(out, sr, v, start, maxLen, vel);
      break;
    default:
      drum(out, sr, v, start, maxLen, vel, seed);
  }
}

// ─── 잔향 (Freeverb 계열) ───────────────────────────────────
function reverb(input: Float32Array, sr: number, room: number): [Float32Array, Float32Array] {
  const scale = sr / 44100;
  const combs = [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617];
  const aps = [556, 441, 341, 225];
  const fb = 0.7 + room * 0.26;
  const damp = 0.3;
  const outL = new Float32Array(input.length);
  const outR = new Float32Array(input.length);
  for (const [out, spread] of [
    [outL, 0],
    [outR, 23],
  ] as const) {
    const tmp = new Float32Array(input.length);
    for (const c of combs) {
      const size = Math.max(1, Math.floor((c + spread) * scale));
      const buf = new Float32Array(size);
      let idx = 0;
      let store = 0;
      for (let n = 0; n < input.length; n++) {
        const y = buf[idx] ?? 0;
        store = y * (1 - damp) + store * damp;
        buf[idx] = (input[n] ?? 0) * 0.015 + store * fb;
        tmp[n] = (tmp[n] ?? 0) + y;
        if (++idx >= size) idx = 0;
      }
    }
    for (const a of aps) {
      const size = Math.max(1, Math.floor((a + spread) * scale));
      const buf = new Float32Array(size);
      let idx = 0;
      for (let n = 0; n < input.length; n++) {
        const b = buf[idx] ?? 0;
        const x = tmp[n] ?? 0;
        tmp[n] = b - x;
        buf[idx] = x + b * 0.5;
        if (++idx >= size) idx = 0;
      }
    }
    out.set(tmp);
  }
  return [outL, outR];
}

/** 잔향 꼬리 (초) */
export const TAIL = 4;

/**
 * 악보 전체를 렌더링한다.
 * loop=true면 끝에서 넘친 소리(여음·잔향)를 앞으로 접어 넣어 이음매 없이 반복된다.
 */
export function render(spec: RenderSpec): Rendered {
  const { sr } = spec;
  const body = Math.round(spec.length * sr);
  const total = body + Math.round(TAIL * sr);
  const L = new Float32Array(total);
  const R = new Float32Array(total);
  const send = new Float32Array(total);
  let seed = 7;
  for (const part of spec.parts) {
    const mono = new Float32Array(total);
    for (const v of part.voices) renderVoice(mono, sr, v, seed++);
    const ang = ((part.pan + 1) / 2) * (Math.PI / 2);
    const gl = Math.cos(ang) * part.vol;
    const gr = Math.sin(ang) * part.vol;
    const rs = part.rev * part.vol;
    for (let n = 0; n < total; n++) {
      const s = mono[n] ?? 0;
      L[n] = (L[n] ?? 0) + s * gl;
      R[n] = (R[n] ?? 0) + s * gr;
      send[n] = (send[n] ?? 0) + s * rs;
    }
  }
  const [rl, rr] = reverb(send, sr, spec.room);
  for (let n = 0; n < total; n++) {
    L[n] = (L[n] ?? 0) + (rl[n] ?? 0);
    R[n] = (R[n] ?? 0) + (rr[n] ?? 0);
  }

  let left: Float32Array;
  let right: Float32Array;
  if (spec.loop) {
    left = L.slice(0, body);
    right = R.slice(0, body);
    for (let n = body; n < total; n++) {
      const i = (n - body) % body;
      left[i] = (left[i] ?? 0) + (L[n] ?? 0);
      right[i] = (right[i] ?? 0) + (R[n] ?? 0);
    }
  } else {
    left = L;
    right = R;
    // 끝 0.5초는 서서히 줄인다
    const fade = Math.floor(0.5 * sr);
    for (let n = 0; n < fade; n++) {
      const g = n / fade;
      const i = total - 1 - n;
      left[i] = (left[i] ?? 0) * g;
      right[i] = (right[i] ?? 0) * g;
    }
  }

  // 음량 맞추기: RMS 목표에 맞춘 뒤 부드러운 제한기로 봉우리만 눌러 준다
  let sum = 0;
  for (let n = 0; n < left.length; n++) sum += (left[n] ?? 0) ** 2 + (right[n] ?? 0) ** 2;
  const rms = Math.sqrt(sum / (left.length * 2)) || 1e-9;
  const target = Math.pow(10, (spec.targetDb ?? -19) / 20);
  const g = target / rms;
  let peak = 0;
  let sum2 = 0;
  for (const ch of [left, right]) {
    for (let n = 0; n < ch.length; n++) {
      const x = (ch[n] ?? 0) * g;
      const y = Math.abs(x) < 0.6 ? x : Math.sign(x) * (0.6 + 0.4 * Math.tanh((Math.abs(x) - 0.6) / 0.4));
      ch[n] = y;
      peak = Math.max(peak, Math.abs(y));
      sum2 += y * y;
    }
  }
  const rmsDb = 20 * Math.log10(Math.sqrt(sum2 / (left.length * 2)) || 1e-9);
  return { sr, left, right, loop: spec.loop, peak, rmsDb };
}
