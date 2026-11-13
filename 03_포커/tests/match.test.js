import { describe, it, expect } from 'vitest';
import { applyPick, picksByPlayer, finishRound } from '../src/game/match.js';
import { dealRound } from '../src/game/deck.js';
import { compareHands } from '../src/game/handEvaluator.js';

const R = { J: 11, Q: 12, K: 13, A: 14 };
const h = (s) => s.split(' ').map((t) => ({ rank: R[t.slice(0, -1)] ?? Number(t.slice(0, -1)), suit: t.slice(-1) }));

describe('카드 고르기 규칙', () => {
  it('고르기 → 2장 → 3번째는 가장 먼저 고른 카드와 교체', () => {
    let s = { picks: {}, seq: 0 };
    for (const c of [3, 7, 9]) s = applyPick(s.picks, s.seq, 'A', c);
    expect(picksByPlayer(s.picks).A).toEqual([7, 9]);
  });
  it('내 카드 다시 누르면 취소', () => {
    let s = applyPick({}, 0, 'A', 5);
    s = applyPick(s.picks, s.seq, 'A', 5);
    expect(s.picks).toEqual({});
  });
  it('남의 카드는 못 가져감, 취소하면 가져갈 수 있음', () => {
    let s = applyPick({}, 0, 'A', 5);
    const fail = applyPick(s.picks, s.seq, 'B', 5);
    expect(fail.ok).toBe(false);
    expect(fail.error).toBe('taken');
    s = applyPick(s.picks, s.seq, 'A', 5); // A 취소
    s = applyPick(s.picks, s.seq, 'B', 5);
    expect(picksByPlayer(s.picks).B).toEqual([5]);
  });
});

describe('판 끝내기 (2~4명)', () => {
  const community = h('KS KH 4D');
  //            0    1    2    3    4    5    6    7    8    9   10   11   12  13   14   15   16   17   18   19
  const grid = h('KD 4C AS 2C 3D 9S 7H 5C JD 6H QS 8C 10D 2H 3S 5D 6C 7S 9D JC');

  it('순위가 족보대로, 1등 1명', () => {
    let s = { picks: {}, seq: 0 };
    s = applyPick(s.picks, s.seq, 'A', 0); s = applyPick(s.picks, s.seq, 'A', 1);   // K K K 4 4 풀하우스
    s = applyPick(s.picks, s.seq, 'B', 2); s = applyPick(s.picks, s.seq, 'B', 10);  // K 원페어 (A Q 키커)
    s = applyPick(s.picks, s.seq, 'C', 3); s = applyPick(s.picks, s.seq, 'C', 4);   // K 원페어 (4 3 키커)
    const r = finishRound({ community, grid, picks: s.picks, players: [{ id: 'A', seat: 0 }, { id: 'B', seat: 1 }, { id: 'C', seat: 2 }] });
    expect(r.ranking.map((x) => x.id)).toEqual(['A', 'B', 'C']);
    expect(r.ranking.map((x) => x.place)).toEqual([1, 2, 3]);
    expect(r.winners).toEqual(['A']);
    expect(r.draw).toBe(false);
    expect(r.ranking[0].desc).toBe('K×3 + 4×2 풀하우스');
    expect(r.verdict.detail).toBe('풀하우스가 원페어보다 높은 족보');
  });

  it('공동 1등이면 무승부', () => {
    let s = { picks: {}, seq: 0 };
    s = applyPick(s.picks, s.seq, 'A', 3); s = applyPick(s.picks, s.seq, 'A', 14); // 2C 3S
    s = applyPick(s.picks, s.seq, 'B', 13); s = applyPick(s.picks, s.seq, 'B', 4); // 2H 3D
    const r = finishRound({ community, grid, picks: s.picks, players: [{ id: 'A', seat: 0 }, { id: 'B', seat: 1 }] });
    expect(r.draw).toBe(true);
    expect(r.winners.sort()).toEqual(['A', 'B']);
    expect(r.ranking.every((x) => x.place === 1)).toBe(true);
  });

  it('못 고른 사람은 가장 약한 카드로 채우고 표시', () => {
    for (let t = 0; t < 10; t++) {
      const d = dealRound();
      const players = [{ id: 'A', seat: 0 }, { id: 'B', seat: 1 }, { id: 'C', seat: 2 }, { id: 'D', seat: 3 }];
      const r = finishRound({ community: d.community, grid: d.grid, picks: {}, players });
      const all = Object.keys(r.picks);
      expect(all).toHaveLength(8); // 4명 × 2장, 칸 중복 없음
      for (const p of r.ranking) {
        expect(p.cells).toHaveLength(2);
        expect(p.auto).toBe(2);
      }
      // 첫 번째 사람(자리 0)은 남은 칸 중 가장 약한 조합
      const a = r.ranking.find((x) => x.id === 'A');
      for (let i = 0; i < 20; i++) for (let j = i + 1; j < 20; j++) {
        expect(compareHands(a.cards, [...d.community, d.grid[i], d.grid[j]])).toBeLessThanOrEqual(0);
      }
    }
  });

  it('결과는 JSON 으로 그대로 저장 가능', () => {
    const d = dealRound();
    const r = finishRound({ community: d.community, grid: d.grid, picks: {}, players: [{ id: 'A', seat: 0 }, { id: 'B', seat: 1 }] });
    expect(JSON.parse(JSON.stringify(r))).toEqual(r);
  });
});
