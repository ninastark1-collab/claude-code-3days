/**
 * 삼국지 천하쟁패 BGM 악보 (음향감독 작곡, 전곡 창작곡)
 *
 * 선율은 간보(숫자 악보)로 적었다. 표기법은 score.ts 머리말 참고.
 * 반주(분산화음·저음·패드)와 타악은 화성 진행(prog)에서 자동으로 만든다.
 * 큐(어느 화면에서 무엇을 트는지)는 `음향_BGM_큐시트.md` 참고.
 */
import type { Layer, Song } from './score';

// ─── 작곡 도구 ──────────────────────────────────────────
/** n마디 쉼 */
const R = (n: number, meter = 4) => Array.from({ length: n }, () => `0:${meter} |`).join(' ');
/** 첫 칸만 치고 n마디 쉬는 타악 격자 (n마디마다 한 번) */
const once = (bars: number, meter = 4) => 'X' + '.'.repeat(bars * meter * 4 - 1);
/** 근음-5도-8도-10도로 흐르는 쟁 분산화음 (8분음표 8개 = 4박) */
const FLOW = { pat: [0, 4, 7, 9, 7, 4, 2, 4], div: 0.5 };
const ROCK = { pat: [0, 4, 7, 4], div: 0.5 };
const TRIAD = [0, 2, 4];
const OPEN = [0, 4, 7];

const bassWhole = (oct = -2, vol = 0.7, inst: Layer['inst'] = 'cello'): Layer => ({ inst, bass: true, oct, vol, rev: 0.2 });
const padLayer = (vol = 0.45, from?: number, to?: number): Layer => ({ inst: 'pad', chord: TRIAD, oct: -1, vol, rev: 0.5, from, to });

// ─── 1. 타이틀: 천하쟁패 ─────────────────────────────────
const TITLE_A = `1:2 3:1~ 4 | 5:3^ 4:.5 3 | 1:1.5 3:.5 1:1 7, | 5,:4 | 1:2 3:1~ 5 | 7:3 5:1 | 4:1.5 3:.5 1:1 3 | 5:3 7,:1 |`;
const TITLE_B = `3':2 1':1 7 | 2':3 7:1 | 5:1.5 7:.5 1':1 3' | 5':4^ | 4':2 3':1~ 1' | 3':2 1':1 7 | 5:1.5 4:.5 3:1 2 | 5,:4 |`;

const title: Song = {
  id: 'title',
  title: '천하쟁패',
  bpm: 72,
  key: 62, // D 우조
  mode: 'minor',
  loop: true,
  room: 0.75,
  prog: [1, 1, 6, 5, 1, 7, 4, 5, 6, 7, 1, 1, 4, 6, 5, 5],
  layers: [
    { inst: 'erhu', mel: TITLE_A + ' ' + TITLE_B, vol: 0.95, pan: 0.12, rev: 0.35 },
    { inst: 'dizi', mel: `${R(8)} 1':4 | 2':4 | 3':4 | 1':4 | 1':4 | 1':4 | 7:4 | 5:4 |`, oct: 0, vol: 0.32, pan: -0.25, rev: 0.5 },
    { inst: 'zheng', arp: FLOW, oct: -1, vol: 0.6, pan: -0.3, rev: 0.35 },
    bassWhole(-2, 0.75),
    padLayer(0.35, 0, 8),
    padLayer(0.6, 8),
    { inst: 'taiko', grid: 'X.......x.......', from: 4, to: 8, vol: 0.8 },
    { inst: 'taiko', grid: 'X.......x...x.x.', from: 8, vol: 0.9 },
    { inst: 'gong', grid: once(8), vol: 0.7, rev: 0.4 },
    { inst: 'cymbal', grid: once(4), from: 12, to: 13, vol: 0.5 },
  ],
};

// ─── 2. 시나리오·군주 선택: 군웅할거 ───────────────────────────
const prologue: Song = {
  id: 'prologue',
  title: '군웅할거',
  bpm: 84,
  key: 67, // G 궁조
  mode: 'major',
  loop: true,
  room: 0.6,
  prog: [1, 6, 4, 5, 1, 6, 2, 5, 4, 5, 3, 6, 4, 5, 1, 1],
  layers: [
    {
      inst: 'dizi',
      mel:
        `5:1 6:.5 5 3:1 2 | 3:3 0:1 | 6,:1 1:.5 2 3:1 5 | 5:2 3:1 2 | 1:1 2:.5 3 5:1 6 | 5:3 3:1 | 2:1 3:.5 2 1:1 6, | 5,:4 |` +
        ` 1':2 6:1 5 | 6:1 5:.5 3 2:2 | 3:1 5 6 1' | 6:4 | 1':1 6:.5 5 3:1 5 | 6:1 5:.5 6 1':2 | 2':1 1':.5 6 5:1 3 | 5:4 |`,
      vol: 0.85,
      pan: 0.15,
      rev: 0.4,
    },
    { inst: 'zheng', arp: { pat: [0, 4, 7, 4, 9, 4, 7, 4], div: 0.5 }, oct: -1, vol: 0.6, pan: -0.3 },
    { inst: 'qin', bass: true, oct: -2, vol: 0.75 },
    padLayer(0.3, 8),
    { inst: 'block', grid: '....x.......x...', from: 8, vol: 0.35 },
  ],
};

// ─── 3. 전략 지도(평시): 천하도 ────────────────────────────────
const MAP_A = `3:.5 5 6 1' 6:1 5 | 3:1.5 2:.5 1:2 | 2:.5 3 5 6 5:1 3 | 2:3 0:1 | 3:.5 5 6 1' 2':1 1' | 6:1.5 5:.5 3:2 | 5:.5 6 5 3 2:1 3 | 1:3 0:1 |`;
const MAP_B = `1':2 6:1 5 | 5:3 3:1 | 3:1.5 5:.5 6:1 5 | 6:4 | 2:1.5 3:.5 5:1 6 | 5:2 2:2 | 3:1.5 2:.5 1:1 6, | 1:4 |`;
const mapProgA = [1, 6, 2, 5, 1, 6, 5, 1];
const mapProgB = [4, 5, 3, 6, 2, 5, 1, 1];

const mapPeace: Song = {
  id: 'map_peace',
  title: '천하도',
  bpm: 90,
  key: 60, // C 궁조
  mode: 'major',
  loop: true,
  room: 0.6,
  prog: [...mapProgA, ...mapProgB, ...mapProgA, ...mapProgB],
  layers: [
    { inst: 'zheng', mel: `${MAP_A} ${R(24)}`, vol: 0.9, pan: -0.1, rev: 0.35 },
    { inst: 'erhu', mel: `${R(8)} ${MAP_B} ${R(8)} ${MAP_B}`, vol: 0.8, pan: 0.2, rev: 0.4 },
    { inst: 'dizi', mel: `${R(16)} ${MAP_A} ${R(8)}`, oct: 1, vol: 0.55, pan: 0.15, rev: 0.45 },
    { inst: 'pipa', arp: ROCK, oct: -1, vol: 0.45, pan: -0.35, from: 8, to: 16 },
    { inst: 'pipa', arp: ROCK, oct: -1, vol: 0.45, pan: -0.35, from: 24 },
    { inst: 'zheng', arp: FLOW, oct: -1, vol: 0.5, pan: -0.3, from: 16, to: 24 },
    { inst: 'qin', bass: true, oct: -2, vol: 0.6 },
    padLayer(0.25, 8),
    { inst: 'block', grid: 'x.......o.......', from: 8, vol: 0.3 },
  ],
};

// ─── 4. 전략 지도(전시·침공 임박): 전운 ─────────────────────────
const warProg = [1, 1, 6, 3, 1, 1, 4, 5, 3, 7, 4, 4, 3, 6, 5, 1];
const mapWar: Song = {
  id: 'map_war',
  title: '전운',
  bpm: 100,
  key: 64, // E 우조
  mode: 'minor',
  loop: true,
  room: 0.55,
  prog: warProg,
  layers: [
    {
      inst: 'erhu',
      mel:
        `1:1.5 7,:.5 1:1 3 | 4:2 3:1 1 | 3:1.5 4:.5 5:1 7 | 5:4 | 1':1.5 7:.5 5:1 4 | 3:2 4:1 3 | 1:1.5 3:.5 4:1 3 | 2:2 7,:2 |` +
        ` 5:2 7:1 1' | 7:2 5:2 | 4:1.5 5:.5 7:1 5 | 4:2 3:2 | 5:2 7:1 1' | 3':2 1':1 7 | 5:1.5 4:.5 3:1 2 | 1:4 |`,
      vol: 0.9,
      pan: 0.1,
      rev: 0.3,
    },
    {
      inst: 'suona',
      mel: `${R(8)} 5:2 7:1 1' | 7:2 5:2 | 4:1.5 5:.5 7:1 5 | 4:2 3:2 | 5:2 7:1 1' | 3':2 1':1 7 | 5:1.5 4:.5 3:1 2 | 1:4 |`,
      oct: -1,
      vol: 0.35,
      pan: -0.2,
      rev: 0.3,
    },
    { inst: 'cello', bass: { pat: [0, 0, 7, 0, 0, 0, 4, 0], div: 0.5 }, oct: -2, vol: 0.65, rev: 0.1 },
    padLayer(0.4),
    { inst: 'taiko', grid: 'X.....x.X.......', vol: 0.85 },
    { inst: 'tom', grid: '....x.......x.x.', from: 4, vol: 0.5 },
    { inst: 'block', grid: '..x...x...x...x.', from: 8, vol: 0.3 },
  ],
};

// ─── 5. 도시(내정): 성시 ──────────────────────────────────
const city: Song = {
  id: 'city',
  title: '성시',
  bpm: 108,
  key: 65, // F 궁조
  mode: 'major',
  loop: true,
  room: 0.45,
  prog: [1, 1, 4, 5, 1, 6, 2, 5, 4, 5, 1, 6, 2, 5, 1, 1],
  layers: [
    {
      inst: 'pipa',
      mel: `1:.5 2 3 5 6:1 5 | 3:.5 5 3 2 1:2 | 6,:.5 1 2 3 5:1 3 | 2:.5 3 2 1 6,:2 | 1:.5 2 3 5 6 1' 6 5 | 3:1 5:.5 3 2:2 | 3:.5 2 1 2 3:1 5 | 2:3 0:1 | ${R(8)}`,
      vol: 0.9,
      pan: -0.1,
      rev: 0.3,
    },
    {
      inst: 'dizi',
      mel: `${R(8)} 5:1 6:.5 1' 2':1 1' | 6:.5 5 6 1' 5:2 | 3:1 5:.5 6 1':1 6 | 5:4 | 6:1 5:.5 3 2:1 3 | 5:.5 6 5 3 2:2 | 1:.5 2 3 5 6:1 5 | 1:3 0:1 |`,
      oct: 1,
      vol: 0.6,
      pan: 0.2,
      rev: 0.35,
    },
    { inst: 'pipa', arp: ROCK, oct: -1, vol: 0.4, pan: 0.3, from: 8 },
    { inst: 'zheng', arp: { pat: [0, null, 7, 4, null, 7, 9, 7], div: 0.5 }, oct: -1, vol: 0.45, pan: -0.35 },
    { inst: 'qin', bass: { pat: [0, 4], div: 2 }, oct: -2, vol: 0.7 },
    { inst: 'block', grid: 'x...o.o.x...o...', vol: 0.4 },
    { inst: 'tom', grid: '........x.......', vol: 0.35 },
    { inst: 'luo', grid: once(8), from: 8, vol: 0.45 },
  ],
};

// ─── 6. 묘당 (외교·무장·연대기): 묘당 ──────────────────────────
const court: Song = {
  id: 'court',
  title: '묘당',
  bpm: 66,
  key: 62, // D 궁조
  mode: 'major',
  loop: true,
  room: 0.8,
  prog: [1, 1, 6, 6, 4, 4, 5, 5, 1, 1, 6, 6, 2, 2, 5, 5],
  layers: [
    {
      inst: 'xiao',
      mel: `3:3 2:1 | 1:2 6,:2 | 1:3 2:1 | 3:4 | 5:2 6:1 5 | 3:2 2:2 | 2:3 3:1 | 2:2 0:2 | 3:3 5:1 | 6:2 5:2 | 3:2 2:1 1 | 6,:4 | 1:2 2:1 3 | 2:2 1:2 | 6,:3 1:1 | 2:4 |`,
      vol: 0.9,
      pan: 0.15,
      rev: 0.55,
    },
    { inst: 'qin', arp: { pat: [0, 4, 7, 4], div: 1 }, oct: -1, vol: 0.75, pan: -0.25, rev: 0.4 },
    { inst: 'bell', mel: `1+5,:4 | ${R(7)} 6,+3,:4 | ${R(7)}`, oct: 0, vol: 0.45, rev: 0.6 },
    bassWhole(-2, 0.45),
    padLayer(0.22),
  ],
};

// ─── 7. 작전 회의: 군의 ──────────────────────────────────
const council: Song = {
  id: 'council',
  title: '군의',
  bpm: 80,
  key: 62, // D 우조
  mode: 'minor',
  loop: true,
  room: 0.55,
  prog: [1, 1, 7, 7, 6, 6, 5, 5, 1, 1, 7, 7, 6, 4, 5, 5],
  layers: [
    {
      inst: 'erhu',
      mel: `5:3 4:1 | 3:2 1:2 | 2:3 4:1 | 4:4 | 6:2 5:1 4 | 3:4 | 2:2 3:1 1 | 2:4 | 1':3 7:1 | 5:2 3:2 | 4:3 5:1 | 7:4 | 6:2 5:1 4 | 4:2 3:2 | 2:2 3:1 1 | 2:4 |`,
      oct: -1,
      vol: 0.85,
      pan: 0.1,
      rev: 0.35,
    },
    { inst: 'cello', bass: { pat: [0, null, 0, 0, null, 0, 0, null], div: 0.5 }, oct: -2, vol: 0.7, rev: 0.1 },
    { inst: 'pad', chord: OPEN, oct: -1, vol: 0.4, rev: 0.5 },
    { inst: 'tom', grid: 'x..o............', vol: 0.55 },
    { inst: 'block', grid: '..o...o...o...o.', from: 8, vol: 0.25 },
    { inst: 'gong', grid: once(16), vol: 0.35, rev: 0.4 },
  ],
};

// ─── 8. 야전: 출진 ───────────────────────────────────────
const BATTLE_C =
  `1:.5 1 3 1 4 1 5 4 | 1:.5 1 3 1 7 5 4 3 | 1:.5 1 3 1 4 1 5 4 | 1:.5 1 3 1 7 5 4 3 |` +
  ` 6,:.5 6, 1 6, 3 6, 4 3 | 6,:.5 6, 1 6, 3 6, 4 3 | 7,:.5 7, 2 7, 4 7, 5 4 | 7,:.5 2 4 5 7 5 4 2 |`;
const battle: Song = {
  id: 'battle',
  title: '출진',
  bpm: 132,
  key: 64, // E 우조
  mode: 'minor',
  loop: true,
  room: 0.45,
  prog: [1, 7, 6, 7, 1, 7, 6, 5, 6, 7, 1, 1, 6, 7, 5, 5, 1, 1, 1, 1, 6, 6, 7, 7],
  layers: [
    {
      inst: 'suona',
      mel: `1:1.5 3:.5 4:1 5 | 7:1.5 5:.5 4:2 | 3:1.5 4:.5 5:1 3 | 4:4 | 1:1.5 3:.5 4:1 5 | 1':1.5 7:.5 5:2 | 4:1.5 3:.5 1:1 3 | 5,:4 | ${R(16)}`,
      vol: 0.6,
      pan: 0.15,
      rev: 0.25,
    },
    {
      inst: 'erhu',
      mel: `${R(8)} 3':2 1':1 7 | 7:2 5:2 | 5:1 7:.5 1' 3':1 5' | 5':4 | 3':1.5 1':.5 7:1 5 | 4:1.5 5:.5 7:2 | 5:1 4:.5 3 2:1 7, | 5,:4 | ${R(8)}`,
      vol: 0.9,
      pan: 0.1,
      rev: 0.3,
    },
    { inst: 'pipa', mel: `${R(16)} ${BATTLE_C}`, vol: 0.8, pan: -0.15, rev: 0.25 },
    { inst: 'zheng', arp: { pat: [0, 7, 4, 7], div: 0.5 }, oct: -1, vol: 0.4, pan: -0.35, to: 16 },
    { inst: 'cello', bass: { pat: [0, 0, 7, 0, 0, 0, 4, 0], div: 0.5 }, oct: -2, vol: 0.7, rev: 0.1 },
    padLayer(0.4, 8),
    { inst: 'taiko', grid: 'X..xX...X..xX.x.', vol: 0.9 },
    { inst: 'tom', grid: '....x.......x.xx', from: 4, vol: 0.55 },
    { inst: 'block', grid: '..x...x...x...x.', from: 16, vol: 0.35 },
    { inst: 'cymbal', grid: once(8), vol: 0.5 },
  ],
};

// ─── 9. 공성전: 공성 ─────────────────────────────────────
const SIEGE_MEL = `1:2 3:1 4 | 5:4 | 4:2 3:1 1 | 7,:4 | 1:2 3:1 4 | 5:2 7:2 | 4:3 3:1 | 5,:4 | 3:2 1:1 3 | 4:4 | 2:2 4:1 5 | 4:4 | 4:2 3:1 1 | 3:4 | 2:3 7,:1 | 5,:4 |`;
const siege: Song = {
  id: 'siege',
  title: '공성',
  bpm: 112,
  key: 60, // C 우조
  mode: 'minor',
  loop: true,
  room: 0.6,
  prog: [1, 1, 6, 7, 1, 1, 4, 5, 6, 6, 7, 7, 4, 4, 5, 5],
  layers: [
    { inst: 'suona', mel: SIEGE_MEL, vol: 0.55, pan: -0.1, rev: 0.3 },
    { inst: 'erhu', mel: SIEGE_MEL, oct: 1, vol: 0.55, pan: 0.2, rev: 0.3 },
    { inst: 'cello', bass: { pat: [0, 0, 0, 1, 0, 0, -1, 0], div: 0.5 }, oct: -2, vol: 0.75, rev: 0.1 },
    { inst: 'pad', chord: OPEN, oct: -1, vol: 0.5, rev: 0.5 },
    { inst: 'pipa', arp: { pat: [0, 0, 4, 0, 7, 0, 4, 0], div: 0.5 }, oct: -1, vol: 0.35, pan: -0.35, from: 8 },
    { inst: 'taiko', grid: 'X...x...X...x...', vol: 1 },
    { inst: 'tom', grid: '..x...x.x.x...xx', from: 4, vol: 0.55 },
    { inst: 'gong', grid: once(4), vol: 0.55, rev: 0.35 },
    { inst: 'cymbal', grid: once(8), from: 8, vol: 0.5 },
  ],
};

// ─── 10. 일기토: 일기토 ───────────────────────────────────
const duel: Song = {
  id: 'duel',
  title: '일기토',
  bpm: 150,
  key: 59, // B 우조
  mode: 'minor',
  loop: true,
  room: 0.4,
  prog: [1, 1, 6, 7, 1, 1, 6, 5, 4, 4, 1, 1, 6, 7, 5, 5],
  layers: [
    {
      inst: 'erhu',
      mel:
        `1:.5 3 4 5 7:1 5 | 4:.5 5 4 3 1:2 | 3:.5 4 5 7 1':1 7 | 5:.5 4 5 7 5:2 | 1:.5 3 4 5 7:1 1' | 3':.5 1' 7 5 4:2 | 3:.5 4 5 3 4:1 3 | 2:2 7,:2 |` +
        ` ${R(4)} 3':.5 1' 7 5 4 5 7 1' | 5':.5 3' 1' 7 1':2 | 7:.5 5 4 3 4:2 | 2:4 |`,
      oct: 1,
      vol: 0.85,
      pan: 0.15,
      rev: 0.25,
    },
    { inst: 'pipa', mel: `${R(8)} 4:2* 5:2* | 6:2* 5:2* | 5:4* | 5:4* | 3:2* 4:2* | 5:2* 7:2* | 5:4* | 2:4* |`, oct: 1, vol: 0.6, pan: -0.2, rev: 0.25 },
    { inst: 'zheng', arp: { pat: [0, 2, 4, 7], div: 0.25 }, oct: 0, vol: 0.3, pan: -0.4, to: 8 },
    { inst: 'cello', bass: { pat: [0, null, 0, 0], div: 0.5 }, oct: -1, vol: 0.7, rev: 0.1 },
    padLayer(0.35, 8),
    { inst: 'taiko', grid: 'X..xX..xX..xX.xx', vol: 0.85 },
    { inst: 'tom', grid: 'o.x.o.x.o.x.o.xx', vol: 0.45 },
    { inst: 'luo', grid: once(8), vol: 0.6 },
    { inst: 'cymbal', grid: once(4), from: 8, vol: 0.45 },
  ],
};

// ─── 11. 전투 결과(승리): 개선 ──────────────────────────────
const RESULT_WIN = `5:1 5:.5 6 1':1 6 | 5:2 3:2 | 5:1 6:.5 5 3:1 2 | 2:4 | 1:1 2:.5 3 5:1 6 | 5:1 6:.5 5 2:2 | 3:1 5:.5 6 5:1 3 | 1:4 |`;
const resultWin: Song = {
  id: 'result_win',
  title: '개선',
  bpm: 96,
  key: 67, // G 궁조
  mode: 'major',
  loop: true,
  room: 0.6,
  prog: [1, 1, 6, 5, 4, 5, 1, 1],
  layers: [
    { inst: 'suona', mel: RESULT_WIN, vol: 0.6, pan: 0.1, rev: 0.35 },
    { inst: 'dizi', mel: RESULT_WIN, oct: 1, vol: 0.3, pan: -0.15, rev: 0.4 },
    { inst: 'zheng', arp: FLOW, oct: -1, vol: 0.55, pan: -0.3 },
    bassWhole(-2, 0.65),
    padLayer(0.4),
    { inst: 'taiko', grid: 'X.......X.......', vol: 0.75 },
    { inst: 'cymbal', grid: once(4), vol: 0.45 },
    { inst: 'luo', grid: '........X.......', vol: 0.3 },
  ],
};

// ─── 12. 전투 결과(패배): 패주 ──────────────────────────────
const resultLose: Song = {
  id: 'result_lose',
  title: '패주',
  bpm: 60,
  key: 69, // A 우조
  mode: 'minor',
  loop: true,
  room: 0.75,
  prog: [1, 6, 4, 5, 1, 4, 5, 1],
  layers: [
    { inst: 'erhu', mel: `5:3~ 4:.5 3 | 1:2 3:1~ 1 | 4:3 3:.5 1 | 7,:4 | 1:2 3:1 4 | 5:1.5 4:.5 3:2 | 3:1 1:.5 7, 5,:2 | 1:4 |`, vol: 0.9, pan: 0.1, rev: 0.45 },
    { inst: 'qin', arp: { pat: [0, 4, 7, 4], div: 1 }, oct: -2, vol: 0.6, pan: -0.25, rev: 0.4 },
    bassWhole(-2, 0.5),
    padLayer(0.3),
    { inst: 'bell', mel: `1,:4 | ${R(7)}`, vol: 0.35, rev: 0.6 },
  ],
};

// ─── 13. 엔딩(천하통일): 천하통일 ────────────────────────────
const endingWin: Song = {
  id: 'ending_win',
  title: '천하통일',
  bpm: 76,
  key: 62, // D 궁조 (타이틀 선율을 장조로)
  mode: 'major',
  loop: true,
  room: 0.8,
  prog: [1, 1, 6, 5, 1, 5, 4, 5, 4, 5, 1, 1, 4, 6, 5, 5],
  layers: [
    { inst: 'erhu', mel: TITLE_A + ' ' + TITLE_B, vol: 0.9, pan: 0.12, rev: 0.4 },
    { inst: 'dizi', mel: `${R(8)} ${TITLE_B}`, oct: 1, vol: 0.32, pan: -0.2, rev: 0.5 },
    { inst: 'zheng', arp: FLOW, oct: -1, vol: 0.6, pan: -0.3, rev: 0.35 },
    bassWhole(-2, 0.75),
    padLayer(0.6),
    { inst: 'bell', mel: `1+5,:4 | ${R(3)} 1+5,:4 | ${R(3)} 1'+5:4 | ${R(3)} 1'+5:4 | ${R(3)}`, vol: 0.4, rev: 0.6 },
    { inst: 'taiko', grid: 'X.......x...x.x.', from: 8, vol: 0.85 },
    { inst: 'taiko', grid: 'X...............', to: 8, vol: 0.6 },
    { inst: 'gong', grid: once(16), vol: 0.6, rev: 0.4 },
    { inst: 'cymbal', grid: once(8), from: 8, vol: 0.5 },
  ],
};

// ─── 14. 엔딩(멸망): 멸망 ─────────────────────────────────
const endingLose: Song = {
  id: 'ending_lose',
  title: '멸망',
  bpm: 56,
  key: 62, // D 우조
  mode: 'minor',
  loop: true,
  room: 0.85,
  prog: [1, 6, 4, 1, 6, 7, 5, 1],
  layers: [
    { inst: 'xiao', mel: `5:3 4:1 | 3:2 1:2 | 4:2 3:1 1 | 1:4 | 3:3 1:1 | 2:2 4:2 | 3:1.5 1:.5 7,:2 | 1:4 |`, vol: 0.9, pan: 0.1, rev: 0.6 },
    { inst: 'qin', arp: { pat: [0, 4, 7, null], div: 1 }, oct: -1, vol: 0.7, pan: -0.25, rev: 0.45 },
    { inst: 'bell', mel: `1,:4 | ${R(3)} 5,,:4 | ${R(3)}`, vol: 0.4, rev: 0.6 },
    bassWhole(-2, 0.45),
    padLayer(0.25),
    { inst: 'gong', grid: once(8), vol: 0.25, rev: 0.5 },
  ],
};

// ─── 짧은 효과 음악 (한 번만 재생) ──────────────────────────────
const stEvent: Song = {
  id: 'st_event',
  title: '고사 (역사 이벤트)',
  bpm: 80,
  key: 62,
  mode: 'minor',
  loop: false,
  room: 0.75,
  prog: [1, 4, 1],
  layers: [
    { inst: 'zheng', mel: `1,:.25 3, 4, 5, 7, 1 3 4 5 7 1' 3' 5':1 | ${R(2)}`, vol: 0.8, pan: -0.2, rev: 0.45 },
    { inst: 'erhu', mel: `0:4 | 5:1.5 4:.5 3:1~ 1 | 1:4 |`, vol: 0.9, pan: 0.15, rev: 0.4 },
    { inst: 'pad', chord: TRIAD, oct: -1, vol: 0.45, rev: 0.5, from: 1 },
    { inst: 'cello', bass: true, oct: -2, vol: 0.6, from: 1 },
    { inst: 'gong', grid: once(3), vol: 0.7, rev: 0.4 },
  ],
};

const stDeath: Song = {
  id: 'st_death',
  title: '졸 (장수 사망)',
  bpm: 60,
  key: 57, // A 우조
  mode: 'minor',
  loop: false,
  room: 0.85,
  prog: [1, 4, 1],
  layers: [
    { inst: 'xiao', mel: `0:1 5':2 4':1 | 3':2 1':2 | 1':4 |`, vol: 0.9, rev: 0.6 },
    { inst: 'bell', mel: `1+5,:4 | ${R(2)}`, vol: 0.5, rev: 0.6 },
    padLayer(0.3),
  ],
};

const stVictory: Song = {
  id: 'st_victory',
  title: '승전고 (전투 승리)',
  bpm: 120,
  key: 67, // G 궁조
  mode: 'major',
  loop: false,
  room: 0.6,
  prog: [1, 1, 1],
  layers: [
    { inst: 'suona', mel: `5,:.5 5, 1:1 3:.5 3 5:1 | 1':3! 0:1 | 0:4 |`, vol: 0.75, pan: 0.1, rev: 0.35 },
    { inst: 'dizi', mel: `5,:.5 5, 1:1 3:.5 3 5:1 | 1':3 0:1 | 0:4 |`, oct: 1, vol: 0.3, rev: 0.4 },
    { inst: 'zheng', mel: `0:4 | 1:.25 2 3 5 6 1' 2' 3' 5':2 | 0:4 |`, vol: 0.55, pan: -0.3 },
    { inst: 'pad', chord: TRIAD, oct: -1, vol: 0.45, from: 1, to: 2 },
    { inst: 'taiko', grid: 'X...X...X.X.X...|X...............|................', vol: 0.9 },
    { inst: 'cymbal', grid: '................X...............|................', vol: 0.55 },
  ],
};

const stDefeat: Song = {
  id: 'st_defeat',
  title: '패전 (전투 패배)',
  bpm: 70,
  key: 57, // A 우조
  mode: 'minor',
  loop: false,
  room: 0.75,
  prog: [1, 5, 1],
  layers: [
    { inst: 'erhu', mel: `5:1.5 4:.5 3:1~ 1 | 7,:2 5,:2 | 0:4 |`, oct: 1, vol: 0.9, rev: 0.45 },
    padLayer(0.4, 0, 2),
    { inst: 'cello', bass: true, oct: -2, vol: 0.55, to: 2 },
    { inst: 'taiko', grid: 'X.......x.......|X...............|................', vol: 0.7 },
    { inst: 'gong', grid: '................X...............|................', vol: 0.35 },
  ],
};

const stDuel: Song = {
  id: 'st_duel',
  title: '격돌 (일기토 개시)',
  bpm: 140,
  key: 59, // B 우조
  mode: 'minor',
  loop: false,
  room: 0.5,
  prog: [1, 1],
  layers: [
    { inst: 'erhu', mel: `0:2 5:1^ 1':1~ | 1':3! 0:1 |`, oct: 1, vol: 0.85, rev: 0.3 },
    { inst: 'tom', grid: 'X.....x.....x...|x...x...x.x.xxxx', vol: 0.7 },
    { inst: 'gong', grid: once(2), vol: 0.6 },
    { inst: 'luo', grid: '................X...............', vol: 0.55 },
  ],
};

const stAlarm: Song = {
  id: 'st_alarm',
  title: '경보 (적 침공)',
  bpm: 132,
  key: 64, // E 우조
  mode: 'minor',
  loop: false,
  room: 0.5,
  prog: [1, 1, 1],
  layers: [
    { inst: 'suona', mel: `0:2 1:.5 1 1':1! | 7:.5 5 4 5 1:2 | 0:4 |`, vol: 0.65, rev: 0.3 },
    { inst: 'taiko', grid: 'X.X.X.X.XXXXXXXX|X...............|................', vol: 0.9 },
    { inst: 'cymbal', grid: once(2), vol: 0.45 },
    { inst: 'cello', bass: true, oct: -2, vol: 0.55, to: 2 },
  ],
};

const stSeason: Song = {
  id: 'st_season',
  title: '절기 (새 계절)',
  bpm: 100,
  key: 67, // G 궁조
  mode: 'major',
  loop: false,
  room: 0.7,
  prog: [1, 1],
  layers: [
    { inst: 'zheng', mel: `1:.25 2 3 5 6 1' 2' 3' 5':2 | 0:4 |`, vol: 0.75, pan: -0.15, rev: 0.45 },
    { inst: 'bell', mel: `0:2 1'+5:2 | 0:4 |`, vol: 0.35, rev: 0.6 },
  ],
};

// ─── 목록 ───────────────────────────────────────────────
export const LOOPS = {
  title,
  prologue,
  map_peace: mapPeace,
  map_war: mapWar,
  city,
  court,
  council,
  battle,
  siege,
  duel,
  result_win: resultWin,
  result_lose: resultLose,
  ending_win: endingWin,
  ending_lose: endingLose,
} satisfies Record<string, Song>;

export const STINGERS = {
  st_event: stEvent,
  st_death: stDeath,
  st_victory: stVictory,
  st_defeat: stDefeat,
  st_duel: stDuel,
  st_alarm: stAlarm,
  st_season: stSeason,
} satisfies Record<string, Song>;

export type BgmId = keyof typeof LOOPS;
export type StingerId = keyof typeof STINGERS;
export const SONGS: Record<BgmId | StingerId, Song> = { ...LOOPS, ...STINGERS };
