import { melodyBeats, songLength, songToSpec } from '../src/audio/score';
import { DRUMS, render } from '../src/audio/synth';
import { castleEngaged, pickBgm } from '../src/audio/cues';
import { LOOPS, SONGS, STINGERS } from '../src/audio/tracks';

describe('BGM 악보', () => {
  for (const [id, song] of Object.entries(SONGS)) {
    it(`${id}: 모든 성부의 박 수가 곡 길이와 같다`, () => {
      const meter = song.meter ?? 4;
      const beats = song.prog.length * meter;
      for (const l of song.layers) {
        if (l.mel) expect(melodyBeats(l.mel), `${id}/${l.inst}`).toBe(beats);
        if (l.grid) expect(l.grid.replace(/[|\s]/g, '').length % (meter * 4), `${id}/${l.inst} 격자`).toBe(0);
        if (DRUMS.has(l.inst)) expect(l.grid, `${id}/${l.inst}`).toBeTruthy();
      }
      for (const c of song.prog.flat()) expect(c >= 0 && c <= 7).toBe(true);
      // 마디줄 검사는 songToSpec 안의 해석기가 한다 (틀리면 예외)
      expect(() => songToSpec(song, 8000)).not.toThrow();
    });
  }

  it('루프곡은 20초 이상, 효과 음악은 15초 이하', () => {
    for (const s of Object.values(LOOPS)) expect(songLength(s), s.id).toBeGreaterThanOrEqual(20);
    for (const s of Object.values(STINGERS)) expect(songLength(s), s.id).toBeLessThanOrEqual(15);
  });
});

describe('BGM 합성', () => {
  it('효과 음악: 소리가 나고, 깨지지 않고, NaN이 없다', () => {
    for (const s of Object.values(STINGERS)) {
      const r = render(songToSpec(s, 8000));
      expect(r.peak, s.id).toBeGreaterThan(0.1);
      expect(r.peak, s.id).toBeLessThanOrEqual(1);
      expect(r.left.every(Number.isFinite), s.id).toBe(true);
    }
  });

  it('루프곡: 끝과 처음이 이어진다 (이음매에서 튀지 않음)', () => {
    for (const id of ['council', 'result_lose'] as const) {
      const r = render(songToSpec(LOOPS[id], 8000));
      expect(r.loop).toBe(true);
      const n = r.left.length;
      expect(n).toBe(Math.round(songLength(LOOPS[id]) * 8000));
      // 이음매의 표본 차이가 곡 안에서 이웃 표본 차이의 일반적 범위를 넘지 않는다
      let maxStep = 0;
      for (let i = 1; i < n; i++) maxStep = Math.max(maxStep, Math.abs((r.left[i] ?? 0) - (r.left[i - 1] ?? 0)));
      const seam = Math.abs((r.left[0] ?? 0) - (r.left[n - 1] ?? 0));
      expect(seam, id).toBeLessThanOrEqual(maxStep);
    }
  });

  it('같은 악보는 늘 같은 소리 (결정적)', () => {
    const a = render(songToSpec(STINGERS.st_duel, 8000));
    const b = render(songToSpec(STINGERS.st_duel, 8000));
    expect(Array.from(a.left.slice(0, 2000))).toEqual(Array.from(b.left.slice(0, 2000)));
  });
});

describe('BGM 큐 고르기', () => {
  const base = { screen: 'strategy', overlay: null, battle: null, ending: null, atWar: false, duel: false, siege: false } as const;
  const field = { auto: true, started: true, result: null, playerSide: 'atk' };
  it('화면별 기본 곡', () => {
    expect(pickBgm({ ...base, screen: 'title' })).toBe('title');
    expect(pickBgm({ ...base, screen: 'lord' })).toBe('prologue');
    expect(pickBgm(base)).toBe('map_peace');
    expect(pickBgm({ ...base, atWar: true })).toBe('map_war');
    expect(pickBgm({ ...base, overlay: 'city3d' })).toBe('city');
    expect(pickBgm({ ...base, overlay: 'diplomacy' })).toBe('court');
    expect(pickBgm({ ...base, overlay: 'settings' })).toBe('map_peace');
    expect(pickBgm({ ...base, screen: 'ending', ending: 'defeat' })).toBe('ending_lose');
  });
  it('전투 단계별 곡', () => {
    const s = { ...base, screen: 'battle' };
    expect(pickBgm({ ...s, battle: { ...field, started: false } })).toBe('council');
    expect(pickBgm({ ...s, battle: field })).toBe('battle');
    expect(pickBgm({ ...s, battle: field, siege: true })).toBe('siege');
    expect(pickBgm({ ...s, battle: field, duel: true })).toBe('duel');
    expect(pickBgm({ ...s, battle: { ...field, result: { winner: 'atk' } } })).toBe('result_win');
    expect(pickBgm({ ...s, battle: { ...field, playerSide: 'def', result: { winner: 'atk' } } })).toBe('result_lose');
  });

  it('공성: 공격군이 성벽 2칸 안에 들어와야 공성 곡', () => {
    // 5×1 전장, 4번 칸이 성문
    const tiles = [{ t: 'plain' }, { t: 'plain' }, { t: 'plain' }, { t: 'plain' }, { t: 'gate' }];
    expect(castleEngaged({ w: 5, tiles, units: [{ side: 'atk', troops: 100, x: 0, y: 0 }] })).toBe(false);
    expect(castleEngaged({ w: 5, tiles, units: [{ side: 'def', troops: 100, x: 3, y: 0 }] })).toBe(false);
    expect(castleEngaged({ w: 5, tiles, units: [{ side: 'atk', troops: 100, x: 2, y: 0 }] })).toBe(true);
    expect(castleEngaged({ w: 5, tiles: [...tiles.slice(0, 4), { t: 'wall', fire: 3 }], units: [] })).toBe(true);
  });
});
