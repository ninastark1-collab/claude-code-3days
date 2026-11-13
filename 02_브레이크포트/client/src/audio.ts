/**
 * Procedural sound effects (Web Audio): no audio files. Browsers only allow audio after a user
 * gesture, so the context is created/resumed on the first pointer event.
 */

export type Sfx = "select" | "deploy" | "hit" | "shoot" | "boom" | "towerDown" | "tick" | "go" | "win" | "lose" | "error" | "spell";

const MUTE_KEY = "bf_muted";
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noiseBuf: AudioBuffer | null = null;
let muted = readMuted();
const lastPlayed = new Map<Sfx, number>();
const MIN_GAP: Partial<Record<Sfx, number>> = { hit: 0.07, shoot: 0.09, boom: 0.06 };

function readMuted(): boolean {
  try { return localStorage.getItem(MUTE_KEY) === "1"; } catch { return false; }
}

export function isMuted() { return muted; }
export function setMuted(m: boolean) {
  muted = m;
  try { localStorage.setItem(MUTE_KEY, m ? "1" : "0"); } catch { /* ignore */ }
  if (master) master.gain.value = m ? 0 : 0.5;
}

/** Call from any pointer handler; safe to call repeatedly. */
export function unlockAudio() {
  try {
    if (!ctx) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.5;
      master.connect(ctx.destination);
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    if (ctx.state === "suspended") void ctx.resume();
  } catch { /* audio unavailable */ }
}

function tone(freq: number, dur: number, type: OscillatorType, vol: number, at = 0, slideTo?: number) {
  const c = ctx!, t = c.currentTime + at;
  const o = c.createOscillator(), g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(master!);
  o.start(t);
  o.stop(t + dur + 0.02);
}

function noise(dur: number, vol: number, cutoff: number, at = 0, endCutoff?: number) {
  const c = ctx!, t = c.currentTime + at;
  const src = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
  src.buffer = noiseBuf;
  f.type = "lowpass";
  f.frequency.setValueAtTime(cutoff, t);
  if (endCutoff) f.frequency.exponentialRampToValueAtTime(endCutoff, t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(master!);
  src.start(t, Math.random() * 0.5);
  src.stop(t + dur + 0.02);
}

export function play(s: Sfx) {
  if (!ctx || !master || muted || ctx.state !== "running") return;
  const now = ctx.currentTime;
  const gap = MIN_GAP[s];
  if (gap && now - (lastPlayed.get(s) ?? -1) < gap) return;
  lastPlayed.set(s, now);
  switch (s) {
    case "select": tone(660, 0.06, "triangle", 0.25); break;
    case "deploy": tone(320, 0.12, "triangle", 0.35, 0, 640); noise(0.12, 0.15, 1800); break;
    case "hit": noise(0.06, 0.18, 2500); break;
    case "shoot": tone(900, 0.07, "square", 0.06, 0, 500); break;
    case "spell": noise(0.5, 0.5, 2500, 0, 200); tone(160, 0.4, "sawtooth", 0.25, 0, 50); break;
    case "boom": noise(0.25, 0.35, 1200, 0, 150); break;
    case "towerDown": noise(0.9, 0.6, 900, 0, 60); tone(110, 0.8, "sine", 0.5, 0, 35); break;
    case "tick": tone(520, 0.12, "square", 0.15); break;
    case "go": tone(880, 0.25, "square", 0.18); tone(1320, 0.3, "triangle", 0.15, 0.08); break;
    case "win": [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.3, "triangle", 0.3, i * 0.12)); break;
    case "lose": [440, 370, 311, 220].forEach((f, i) => tone(f, 0.35, "triangle", 0.28, i * 0.16)); break;
    case "error": tone(150, 0.15, "square", 0.15); break;
  }
}

export function vibrate(ms: number) {
  try { navigator.vibrate?.(ms); } catch { /* not supported */ }
}
