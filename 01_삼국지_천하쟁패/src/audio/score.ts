/**
 * 악보 표기 → 합성기 입력(RenderSpec) 변환
 *
 * 선율은 간보(簡譜, 숫자 악보) 식으로 쓴다.
 *   1~7  : 음계 도수 (곡의 조·선법 기준)        0 : 쉼표
 *   ' ,  : 한 옥타브 위 / 아래 (여러 번 가능)     # b : 반음 올림 / 내림
 *   :2   : 길이(박). 생략하면 바로 앞 음 길이를 그대로 쓴다
 *   1+3+5: 화음 (동시에)                       |   : 마디줄 (박 수가 안 맞으면 오류)
 *   꾸밈: ~ 앞 음에서 미끄러져 옴, ^ 아래에서 꺾어 올림, * 트레몰로(윤지), ! 세게, ? 여리게
 *
 * 반주(분산화음·저음·화음 지속)와 타악은 곡의 화성 진행(prog)에서 자동으로 만든다.
 */
import { DRUMS, type Inst, type PartMix, type RenderSpec, type Voice } from './synth';

export type Mode = 'major' | 'minor' | 'dorian';
const SCALES: Record<Mode, number[]> = {
  major: [0, 2, 4, 5, 7, 9, 11], // 궁조 (5음: 1 2 3 5 6)
  minor: [0, 2, 3, 5, 7, 8, 10], // 우조 (5음: 1 3 4 5 7)
  dorian: [0, 2, 3, 5, 7, 9, 10], // 상조 느낌
};

export interface Layer {
  inst: Inst;
  vol?: number;
  pan?: number;
  rev?: number;
  /** 옥타브 이동 */
  oct?: number;
  /** 직접 쓴 선율 (간보) */
  mel?: string;
  /** 분산화음: 화음 근음에서의 음계 걸음 수 목록 (null=쉼), div=한 음 길이(박) */
  arp?: { pat: (number | null)[]; div: number };
  /** 저음: 근음 기준 걸음 수, div=한 음 길이(박). 생략하면 화음 길이만큼 근음 하나 */
  bass?: { pat: (number | null)[]; div: number } | true;
  /** 화음 지속 (근음 기준 걸음 수 목록) */
  chord?: number[];
  /** 타악 격자: 16분음표 한 칸 = 한 글자. X 강 / x 중 / o 약 / . 쉼 / | 무시. 마디 단위로 반복 */
  grid?: string;
  /** 이 층이 연주하는 마디 [from, to) (0부터). 생략하면 처음부터 끝까지 */
  from?: number;
  to?: number;
  vel?: number;
}

export interface Song {
  id: string;
  /** 곡 이름 (한글) */
  title: string;
  bpm: number;
  meter?: number;
  /** 1도의 MIDI 음 번호 */
  key: number;
  mode: Mode;
  /** 마디마다 화음 근음 도수 (0=화음 없음). 배열이면 마디를 똑같이 나눔 */
  prog: (number | number[])[];
  loop: boolean;
  room?: number;
  targetDb?: number;
  layers: Layer[];
}

interface Note {
  /** 박 위치 */
  at: number;
  dur: number;
  steps: number[];
  acc: number[];
  slide: boolean;
  glide: boolean;
  trem: boolean;
  vel: number;
}

const TOKEN = /^([#b]?[0-7][',]*(?:\+[#b]?[0-7][',]*)*)(?::([0-9.]+))?([~^*!?]*)$/;

/** 간보 선율을 해석한다. meter가 주어지면 마디줄마다 박 수를 검사한다 */
export function parseMelody(src: string, meter?: number, label = ''): Note[] {
  const out: Note[] = [];
  let at = 0;
  let dur = 1;
  let bar = 0;
  let barStart = 0;
  for (const raw of src.trim().split(/\s+/)) {
    if (!raw) continue;
    if (raw === '|') {
      if (meter && Math.abs(at - barStart - meter) > 1e-6) {
        throw new Error(`${label} ${bar + 1}마디 박 수 ${at - barStart} (≠ ${meter})`);
      }
      bar++;
      barStart = at;
      continue;
    }
    const m = TOKEN.exec(raw);
    if (!m) throw new Error(`${label} 읽을 수 없는 음표: ${raw}`);
    if (m[2]) dur = Number(m[2]);
    const flags = m[3] ?? '';
    const steps: number[] = [];
    const acc: number[] = [];
    let rest = false;
    for (const one of (m[1] ?? '').split('+')) {
      const a = one.startsWith('#') ? 1 : one.startsWith('b') ? -1 : 0;
      const body = a ? one.slice(1) : one;
      const deg = Number(body[0]);
      if (deg === 0) {
        rest = true;
        continue;
      }
      let oct = 0;
      for (const c of body.slice(1)) oct += c === "'" ? 1 : -1;
      steps.push(deg - 1 + oct * 7);
      acc.push(a);
    }
    if (!rest) {
      out.push({
        at,
        dur,
        steps,
        acc,
        glide: flags.includes('~'),
        slide: flags.includes('^'),
        trem: flags.includes('*'),
        vel: flags.includes('!') ? 1.25 : flags.includes('?') ? 0.6 : 1,
      });
    }
    at += dur;
  }
  return out;
}

export function melodyBeats(src: string): number {
  let at = 0;
  let dur = 1;
  for (const raw of src.trim().split(/\s+/)) {
    if (!raw || raw === '|') continue;
    const m = TOKEN.exec(raw);
    if (!m) throw new Error(`읽을 수 없는 음표: ${raw}`);
    if (m[2]) dur = Number(m[2]);
    at += dur;
  }
  return at;
}

function midiOf(song: Song, step: number, acc: number, oct: number): number {
  const sc = SCALES[song.mode];
  const o = Math.floor(step / 7);
  const d = step - o * 7;
  return song.key + 12 * (o + oct) + (sc[d] ?? 0) + acc;
}
const hz = (midi: number) => 440 * Math.pow(2, (midi - 69) / 12);

/** 마디 → (시작 박, 길이, 근음 걸음) 목록 */
function chords(song: Song): { at: number; len: number; root: number }[] {
  const meter = song.meter ?? 4;
  const out: { at: number; len: number; root: number }[] = [];
  song.prog.forEach((c, bar) => {
    const list = Array.isArray(c) ? c : [c];
    const len = meter / list.length;
    list.forEach((r, i) => out.push({ at: bar * meter + i * len, len, root: r - 1 }));
  });
  return out;
}

function inRange(layer: Layer, beat: number, meter: number): boolean {
  const bar = Math.floor(beat / meter + 1e-9);
  return bar >= (layer.from ?? 0) && bar < (layer.to ?? Infinity);
}

/** 사람 손맛: 박자·세기를 아주 조금 흔든다 (결정적) */
function jitter(seed: number): number {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return (x - Math.floor(x)) * 2 - 1;
}

function layerNotes(song: Song, layer: Layer): Note[] {
  const meter = song.meter ?? 4;
  if (layer.mel) return parseMelody(layer.mel, meter, `${song.id}/${layer.inst}`);
  const out: Note[] = [];
  const mk = (at: number, dur: number, steps: number[]): Note => ({ at, dur, steps, acc: steps.map(() => 0), glide: false, slide: false, trem: false, vel: 1 });
  for (const c of chords(song)) {
    if (c.root < 0 || !inRange(layer, c.at, meter)) continue;
    if (layer.arp) {
      const { pat, div } = layer.arp;
      const n = Math.round(c.len / div);
      for (let i = 0; i < n; i++) {
        const s = pat[i % pat.length];
        if (s === null || s === undefined) continue;
        out.push(mk(c.at + i * div, div, [c.root + s]));
      }
    } else if (layer.bass) {
      if (layer.bass === true) out.push(mk(c.at, c.len, [c.root]));
      else {
        const { pat, div } = layer.bass;
        const n = Math.round(c.len / div);
        for (let i = 0; i < n; i++) {
          const s = pat[i % pat.length];
          if (s === null || s === undefined) continue;
          out.push(mk(c.at + i * div, div, [c.root + s]));
        }
      }
    } else if (layer.chord) {
      out.push(mk(c.at, c.len, layer.chord.map((s) => c.root + s)));
    }
  }
  return out;
}

function gridVoices(song: Song, layer: Layer, beat: number): Voice[] {
  const meter = song.meter ?? 4;
  const cells = (layer.grid ?? '').replace(/[|\s]/g, '');
  const perBar = meter * 4;
  const bars = song.prog.length;
  const out: Voice[] = [];
  if (!cells.length) return out;
  for (let bar = layer.from ?? 0; bar < Math.min(bars, layer.to ?? bars); bar++) {
    for (let i = 0; i < perBar; i++) {
      const rel = ((bar - (layer.from ?? 0)) * perBar + i) % cells.length;
      const ch = cells[rel];
      const v = ch === 'X' ? 1 : ch === 'x' ? 0.7 : ch === 'o' ? 0.4 : 0;
      if (!v) continue;
      const pos = bar * meter + i / 4;
      const j = jitter(pos * 31 + bar);
      out.push({ inst: layer.inst, t: pos * beat + j * 0.004, dur: 0.25 * beat, freq: 0, vel: v * (layer.vel ?? 1) * (1 + j * 0.06) });
    }
  }
  return out;
}

/** 곡 길이 (초) */
export function songLength(song: Song): number {
  return song.prog.length * (song.meter ?? 4) * (60 / song.bpm);
}

export function songToSpec(song: Song, sr: number): RenderSpec {
  const beat = 60 / song.bpm;
  const parts: PartMix[] = [];
  for (const layer of song.layers) {
    let voices: Voice[];
    if (DRUMS.has(layer.inst)) voices = gridVoices(song, layer, beat);
    else {
      voices = [];
      const notes = layerNotes(song, layer);
      const plucked = layer.inst === 'zheng' || layer.inst === 'pipa' || layer.inst === 'qin';
      let prev: { end: number; freq: number } | null = null;
      for (const n of notes) {
        n.steps.forEach((s, i) => {
          const freq = hz(midiOf(song, s, n.acc[i] ?? 0, layer.oct ?? 0));
          const j = jitter(n.at * 17 + s);
          const t = n.at * beat + (plucked ? j * 0.006 + i * 0.018 : 0);
          const legato = prev && Math.abs(prev.end - n.at) < 0.05;
          voices.push({
            inst: layer.inst,
            t: Math.max(0, t),
            dur: n.dur * beat * (plucked ? 1 : 0.97),
            freq,
            vel: (layer.vel ?? 1) * n.vel * (1 + j * 0.07),
            from: n.glide && legato && prev ? prev.freq : undefined,
            slide: n.slide,
            trem: n.trem,
          });
          if (i === n.steps.length - 1) prev = { end: n.at + n.dur, freq };
        });
      }
    }
    parts.push({ vol: layer.vol ?? 1, pan: layer.pan ?? 0, rev: layer.rev ?? 0.25, voices });
  }
  return { sr, length: songLength(song), loop: song.loop, room: song.room ?? 0.6, parts, targetDb: song.targetDb };
}
