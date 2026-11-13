/**
 * BGM 미리듣기 WAV 출력 + 측정
 *   npx tsx scripts/render-bgm.ts            → design/bgm/*.wav (22.05kHz 스테레오, 루프곡은 플레이어 반복 재생으로 이음매 확인)
 *   npx tsx scripts/render-bgm.ts battle     → 해당 곡만
 * 게임은 이 파일들을 쓰지 않는다 (게임 안에서 같은 악보를 실시간 합성).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { songLength, songToSpec } from '../src/audio/score';
import { render } from '../src/audio/synth';
import { SONGS } from '../src/audio/tracks';

const SR = 22050;
const OUT = join(process.cwd(), 'design', 'bgm');
mkdirSync(OUT, { recursive: true });

function wav(left: Float32Array, right: Float32Array, repeat: number): Buffer {
  const frames = left.length * repeat;
  const buf = Buffer.alloc(44 + frames * 4);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + frames * 4, 4);
  buf.write('WAVEfmt ', 8);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(2, 22);
  buf.writeUInt32LE(SR, 24);
  buf.writeUInt32LE(SR * 4, 28);
  buf.writeUInt16LE(4, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(frames * 4, 40);
  let o = 44;
  for (let r = 0; r < repeat; r++) {
    for (let i = 0; i < left.length; i++) {
      buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, left[i] ?? 0)) * 32767), o);
      buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, right[i] ?? 0)) * 32767), o + 2);
      o += 4;
    }
  }
  return buf;
}

const only = process.argv[2];
const ids = Object.keys(SONGS).filter((id) => !only || id === only) as (keyof typeof SONGS)[];
console.log('곡'.padEnd(14), '제목'.padEnd(16), '길이', '  렌더', '  봉우리', ' RMS');
for (const id of ids) {
  const song = SONGS[id];
  const t0 = performance.now();
  const r = render(songToSpec(song, SR));
  const ms = performance.now() - t0;
  writeFileSync(join(OUT, `${id}.wav`), wav(r.left, r.right, 1));
  console.log(id.padEnd(14), song.title.padEnd(16), `${songLength(song).toFixed(1)}s`.padStart(6), `${ms.toFixed(0)}ms`.padStart(7), r.peak.toFixed(2).padStart(7), `${r.rmsDb.toFixed(1)}dB`.padStart(8));
}
