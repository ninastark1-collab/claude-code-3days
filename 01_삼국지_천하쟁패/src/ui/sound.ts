/** WebAudio로 합성한 간단한 효과음 (외부 음원 파일 없음) */
type Sfx = 'ok' | 'ng' | 'click' | 'battle' | 'alarm' | 'win' | 'lose' | 'hit';

let ctx: AudioContext | null = null;
let muted = (() => {
  try {
    return localStorage.getItem('samgukji.muted') === '1';
  } catch {
    return false;
  }
})();

/** 효과음 크기 0~1 (기본 0.85 = 예전 소리 크기). 디자인 회신 0.6.0 */
let sfxVol = (() => {
  try {
    const v = Number(localStorage.getItem('samgukji.sfxVol'));
    return localStorage.getItem('samgukji.sfxVol') !== null && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0.85;
  } catch {
    return 0.85;
  }
})();

export function getSfxVolume(): number {
  return sfxVol;
}

export function setSfxVolume(v: number): void {
  sfxVol = Math.min(1, Math.max(0, v));
  try {
    localStorage.setItem('samgukji.sfxVol', String(sfxVol));
  } catch {
    /* 무시 */
  }
}

export function isMuted(): boolean {
  return muted;
}

export function setMuted(m: boolean): void {
  muted = m;
  try {
    localStorage.setItem('samgukji.muted', m ? '1' : '0');
  } catch {
    /* 무시 */
  }
}

function tone(freq: number, start: number, dur: number, type: OscillatorType = 'triangle', vol = 0.08): void {
  if (!ctx || sfxVol <= 0) return;
  vol *= sfxVol / 0.85;
  const o = ctx.createOscillator();
  const gain = ctx.createGain();
  o.type = type;
  o.frequency.value = freq;
  gain.gain.setValueAtTime(vol, ctx.currentTime + start);
  gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + start + dur);
  o.connect(gain).connect(ctx.destination);
  o.start(ctx.currentTime + start);
  o.stop(ctx.currentTime + start + dur + 0.02);
}

export function sfx(kind: Sfx): void {
  if (muted) return;
  try {
    ctx ??= new AudioContext();
  } catch {
    return;
  }
  switch (kind) {
    case 'click':
      tone(660, 0, 0.05, 'square', 0.03);
      break;
    case 'ok':
      tone(523, 0, 0.08);
      tone(784, 0.07, 0.12);
      break;
    case 'ng':
      tone(220, 0, 0.15, 'sawtooth', 0.04);
      break;
    case 'battle':
      [196, 196, 262, 196].forEach((f, i) => tone(f, i * 0.16, 0.14, 'sawtooth', 0.05));
      break;
    case 'alarm':
      [880, 660, 880, 660].forEach((f, i) => tone(f, i * 0.12, 0.1, 'square', 0.04));
      break;
    case 'win':
      [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.13, 0.25));
      break;
    case 'lose':
      [392, 330, 262, 196].forEach((f, i) => tone(f, i * 0.18, 0.3, 'sine'));
      break;
    case 'hit':
      tone(120, 0, 0.06, 'square', 0.03);
      break;
  }
}
