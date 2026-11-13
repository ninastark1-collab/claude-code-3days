/**
 * BGM 재생기 (게임에서 부르는 곳은 이 파일 하나)
 *
 *   setBgm('map_peace')                      화면 배경음 바꾸기 (같은 곡이면 아무 일 없음, 다른 곡이면 교차 페이드)
 *   setBgm(null)                             배경음 끄기
 *   playStinger('st_event')                  짧은 효과 음악: 배경음을 잠깐 낮추고 위에 얹는다
 *   playStinger('st_victory', 'result_win')  배경음을 끊고 효과 음악 → 끝나면 이어서 루프곡
 *   preloadBgm(['council', 'battle'])        다음에 나올 곡을 미리 합성
 *   setBgmVolume(0~1) / setBgmMuted(bool)    설정 화면용 (기기마다 localStorage에 저장)
 *
 * 음원 파일 없이 악보(tracks.ts)를 작업자(Web Worker)에서 합성한다. 곡당 1~2초, 한 번 만든 곡은 몇 개 기억해 둔다.
 * 곡 목록과 쓰임새는 `음향_BGM_큐시트.md`.
 */
import { songToSpec } from './score';
import { render } from './synth';
import { SONGS, type BgmId, type StingerId } from './tracks';
import BgmWorker from './bgm.worker?worker&inline';

export type { BgmId, StingerId };

/** 합성 샘플레이트: 폰 메모리·CPU를 생각해 24kHz (현악·관악은 이 아래에서 충분) */
const SR = 24000;
/** 합성해 둔 곡을 몇 개까지 기억할지 (곡당 2~8MB) */
const CACHE_MAX = 6;
const FADE = 1.6;
const DUCK = 0.3;

const KEY_VOL = 'samgukji.bgmVolume';
const KEY_MUTE = 'samgukji.bgmMuted';

function readNum(key: string, def: number): number {
  try {
    const v = localStorage.getItem(key);
    return v === null ? def : Math.max(0, Math.min(1, Number(v)));
  } catch {
    return def;
  }
}

let volume = readNum(KEY_VOL, 0.55);
let muted = readNum(KEY_MUTE, 0) === 1;

let ctx: AudioContext | null = null;
let bus: GainNode | null = null;
let duckNode: GainNode | null = null;
let current: { id: BgmId; src: AudioBufferSourceNode; gain: GainNode } | null = null;
let wanted: BgmId | null = null;
let duckDepth = 0;

function audio(): AudioContext | null {
  if (ctx) return ctx;
  try {
    ctx = new AudioContext();
  } catch {
    return null;
  }
  bus = ctx.createGain();
  bus.gain.value = muted ? 0 : volume;
  bus.connect(ctx.destination);
  duckNode = ctx.createGain();
  duckNode.connect(bus);
  // 브라우저 자동재생 제한: 첫 입력 때 깨운다. 폰에서 앱이 뒤로 가면 멈춘다
  const wake = () => void ctx?.resume().catch(() => undefined);
  window.addEventListener('pointerdown', wake, { passive: true });
  window.addEventListener('keydown', wake);
  document.addEventListener('visibilitychange', () => {
    if (!ctx) return;
    if (document.hidden) void ctx.suspend().catch(() => undefined);
    else void ctx.resume().catch(() => undefined);
  });
  return ctx;
}

// ─── 합성 (작업자 → 실패하면 메인 스레드) ─────────────────────────
type Raw = { left: Float32Array; right: Float32Array };
let worker: Worker | null | undefined;
const waiting = new Map<string, ((r: Raw) => void)[]>();

function getWorker(): Worker | null {
  if (worker !== undefined) return worker;
  try {
    const w = new BgmWorker();
    w.onmessage = (e: MessageEvent<Raw & { id: string }>) => {
      const list = waiting.get(e.data.id) ?? [];
      waiting.delete(e.data.id);
      for (const done of list) done(e.data);
    };
    w.onerror = () => {
      worker = null;
    };
    worker = w;
  } catch {
    worker = null;
  }
  return worker;
}

function synth(id: BgmId | StingerId): Promise<Raw> {
  return new Promise((resolve) => {
    const w = getWorker();
    if (w) {
      const list = waiting.get(id);
      if (list) list.push(resolve);
      else {
        waiting.set(id, [resolve]);
        w.postMessage({ id, sr: SR });
      }
      return;
    }
    setTimeout(() => resolve(render(songToSpec(SONGS[id], SR))), 0);
  });
}

const cache = new Map<string, Promise<AudioBuffer>>();

function buffer(id: BgmId | StingerId): Promise<AudioBuffer> | null {
  const ac = audio();
  if (!ac) return null;
  let p = cache.get(id);
  if (p) {
    cache.delete(id); // 최근 사용으로 갱신
    cache.set(id, p);
    return p;
  }
  p = synth(id).then((raw) => {
    const buf = ac.createBuffer(2, raw.left.length, SR);
    buf.copyToChannel(raw.left as Float32Array<ArrayBuffer>, 0);
    buf.copyToChannel(raw.right as Float32Array<ArrayBuffer>, 1);
    return buf;
  });
  cache.set(id, p);
  while (cache.size > CACHE_MAX) {
    const oldest = cache.keys().next().value as string;
    if (oldest === current?.id) {
      const keep = cache.get(oldest)!;
      cache.delete(oldest);
      cache.set(oldest, keep);
      if (cache.size <= CACHE_MAX) break;
      continue;
    }
    cache.delete(oldest);
  }
  return p;
}

// ─── 재생 ───────────────────────────────────────────────
function fadeOutCurrent(sec: number): void {
  if (!current || !ctx) return;
  const { src, gain } = current;
  const t = ctx.currentTime;
  gain.gain.cancelScheduledValues(t);
  gain.gain.setValueAtTime(gain.gain.value, t);
  gain.gain.linearRampToValueAtTime(0, t + sec);
  try {
    src.stop(t + sec + 0.05);
  } catch {
    /* 이미 멈춤 */
  }
  current = null;
}

/** 화면 배경음을 바꾼다. 같은 곡이면 그대로 이어서 튼다 */
export function setBgm(id: BgmId | null, fade = FADE): void {
  wanted = id;
  if (current?.id === id) return;
  if (!id) {
    fadeOutCurrent(fade);
    return;
  }
  const p = buffer(id);
  if (!p) return;
  void p.then((buf) => {
    if (wanted !== id || current?.id === id || !ctx || !duckNode) return;
    fadeOutCurrent(fade);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const gain = ctx.createGain();
    const t = ctx.currentTime;
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(1, t + fade);
    src.connect(gain).connect(duckNode);
    src.start(t + 0.02);
    current = { id, src, gain };
  });
}

/**
 * 짧은 효과 음악.
 * - then 없음: 배경음을 잠깐 낮추고(덕킹) 위에 얹는다 (역사 이벤트, 장수 사망, 새 계절, 적 침공)
 * - then 있음: 배경음을 끊고 효과 음악을 튼 뒤, 끝날 즈음 then 루프곡을 시작한다 (승리→개선, 일기토 개시→일기토)
 */
export function playStinger(id: StingerId, then?: BgmId): void {
  const p = buffer(id);
  if (!p) return;
  if (then) {
    wanted = then;
    fadeOutCurrent(0.4);
    buffer(then); // 미리 합성
  }
  void p.then((buf) => {
    if (!ctx || !bus || !duckNode) return;
    const t = ctx.currentTime + 0.02;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(bus);
    src.start(t);
    // 효과 음악 뒤 4초는 잔향 꼬리: 그보다 조금 앞서 다음 곡을 들인다
    const body = Math.max(0.5, buf.duration - 5.5);
    if (then) {
      setTimeout(() => {
        if (wanted === then) setBgm(then, 2.5);
      }, body * 1000);
      return;
    }
    duckDepth++;
    const g = duckNode.gain;
    g.cancelScheduledValues(t);
    g.setValueAtTime(g.value, t);
    g.linearRampToValueAtTime(DUCK, t + 0.25);
    // 잔향 꼬리가 시작되면 배경음을 천천히 되돌린다 (효과 음악이 겹쳤으면 마지막 것이 끝날 때)
    setTimeout(() => {
      if (--duckDepth > 0 || !ctx || !duckNode) return;
      const now = ctx.currentTime;
      duckNode.gain.cancelScheduledValues(now);
      duckNode.gain.setValueAtTime(duckNode.gain.value, now);
      duckNode.gain.linearRampToValueAtTime(1, now + 2.5);
    }, body * 1000);
  });
}

/** 다음 화면에서 쓸 곡을 미리 합성해 둔다 (전환 때 바로 나오게) */
export function preloadBgm(ids: (BgmId | StingerId)[]): void {
  for (const id of ids) buffer(id);
}

export function currentBgm(): BgmId | null {
  return wanted;
}

export function getBgmVolume(): number {
  return volume;
}

export function setBgmVolume(v: number): void {
  volume = Math.max(0, Math.min(1, v));
  try {
    localStorage.setItem(KEY_VOL, String(volume));
  } catch {
    /* 무시 */
  }
  if (bus && ctx && !muted) bus.gain.setTargetAtTime(volume, ctx.currentTime, 0.05);
}

export function isBgmMuted(): boolean {
  return muted;
}

export function setBgmMuted(m: boolean): void {
  muted = m;
  try {
    localStorage.setItem(KEY_MUTE, m ? '1' : '0');
  } catch {
    /* 무시 */
  }
  if (bus && ctx) bus.gain.setTargetAtTime(m ? 0 : volume, ctx.currentTime, 0.05);
}

/** 확인용: 오디오 상태 (QA·미리듣기 페이지에서 사용) */
export function bgmDebug(): { state: string; playing: BgmId | null; wanted: BgmId | null; cached: string[]; worker: boolean } {
  return { state: ctx?.state ?? 'none', playing: current?.id ?? null, wanted, cached: [...cache.keys()], worker: !!worker };
}
