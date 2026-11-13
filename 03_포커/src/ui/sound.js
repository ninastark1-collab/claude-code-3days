// 효과음: 파일 없이 Web Audio 로 직접 합성 (가볍고, 어느 폰에서나 같은 소리)
// 브라우저 정책상 사용자가 화면을 한 번 누른 뒤부터 소리가 남.
const KEY = 'mp.mute';
let ctx = null;
let master = null;
let muted = (() => { try { return localStorage.getItem(KEY) === '1'; } catch { return false; } })();

function audio() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.5;
    master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}
// 첫 터치 때 소리 장치 깨우기 (iOS 대응)
['pointerdown', 'keydown'].forEach((ev) => addEventListener(ev, () => audio(), { once: true, passive: true }));

export const isMuted = () => muted;
export function setMuted(m) {
  muted = m;
  try { localStorage.setItem(KEY, m ? '1' : '0'); } catch {}
}

function tone(freq, { at = 0, dur = 0.12, type = 'sine', gain = 0.3, slideTo = null } = {}) {
  const c = audio();
  if (!c) return;
  const t = c.currentTime + at;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(master);
  o.start(t);
  o.stop(t + dur + 0.02);
}

function noise({ at = 0, dur = 0.18, gain = 0.25, from = 2500, to = 600 } = {}) {
  const c = audio();
  if (!c) return;
  const t = c.currentTime + at;
  const len = Math.floor(c.sampleRate * dur);
  const buf = c.createBuffer(1, len, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = c.createBufferSource();
  src.buffer = buf;
  const f = c.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.setValueAtTime(from, t);
  f.frequency.exponentialRampToValueAtTime(to, t + dur);
  const g = c.createGain();
  g.gain.value = gain;
  src.connect(f).connect(g).connect(master);
  src.start(t);
}

const SOUNDS = {
  count: () => tone(520, { dur: 0.16, type: 'triangle', gain: 0.35 }),
  go: () => { tone(784, { dur: 0.12, type: 'triangle' }); tone(1046, { at: 0.08, dur: 0.22, type: 'triangle' }); },
  flip: () => { noise({ dur: 0.22, from: 3000, to: 700 }); noise({ at: 0.06, dur: 0.18, gain: 0.15 }); },
  pick: () => tone(880, { dur: 0.07, type: 'square', gain: 0.12, slideTo: 1200 }),
  unpick: () => tone(700, { dur: 0.07, type: 'square', gain: 0.1, slideTo: 450 }),
  taken: () => tone(180, { dur: 0.18, type: 'sawtooth', gain: 0.15 }),
  tick: () => tone(1320, { dur: 0.05, type: 'square', gain: 0.08 }),
  reveal: () => [523, 659, 784].forEach((f, i) => tone(f, { at: i * 0.07, dur: 0.35, type: 'triangle', gain: 0.18 })),
  win: () => [523, 659, 784, 1046, 1318].forEach((f, i) => tone(f, { at: i * 0.09, dur: i === 4 ? 0.6 : 0.2, type: 'triangle', gain: 0.25 })),
  lose: () => [392, 330, 262].forEach((f, i) => tone(f, { at: i * 0.14, dur: 0.3, type: 'sine', gain: 0.22 })),
  draw: () => [523, 523].forEach((f, i) => tone(f, { at: i * 0.15, dur: 0.2, type: 'triangle', gain: 0.2 })),
};

export function play(name) {
  if (muted) return;
  try { SOUNDS[name]?.(); } catch {}
}

export function buzz(pattern) {
  if (muted) return;
  try { navigator.vibrate?.(pattern); } catch {}
}
