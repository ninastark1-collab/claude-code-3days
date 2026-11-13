import { describe, it, expect } from 'vitest';
import { evaluateHand, compareHands, HAND_RANK } from '../src/game/handEvaluator.js';
import { createDeck, dealRound } from '../src/game/deck.js';

// "AS KH 10D" 같은 문자열 → 카드 배열
const R = { J: 11, Q: 12, K: 13, A: 14 };
const h = (s) =>
  s.split(' ').map((t) => {
    const suit = t.slice(-1);
    const r = t.slice(0, -1);
    return { rank: R[r] ?? Number(r), suit };
  });

describe('족보 판정', () => {
  const cases = [
    ['AS KS QS JS 10S', HAND_RANK.ROYAL_FLUSH],
    ['9H 8H 7H 6H 5H', HAND_RANK.STRAIGHT_FLUSH],
    ['5D 4D 3D 2D AD', HAND_RANK.STRAIGHT_FLUSH],
    ['7S 7H 7D 7C 2S', HAND_RANK.FOUR_OF_A_KIND],
    ['3S 3H 3D 9C 9S', HAND_RANK.FULL_HOUSE],
    ['AC 9C 7C 4C 2C', HAND_RANK.FLUSH],
    ['10S 9H 8D 7C 6S', HAND_RANK.STRAIGHT],
    ['AS 2H 3D 4C 5S', HAND_RANK.STRAIGHT],
    ['QS QH QD 4C 2S', HAND_RANK.THREE_OF_A_KIND],
    ['JS JH 4D 4C AS', HAND_RANK.TWO_PAIR],
    ['8S 8H KD 4C 2S', HAND_RANK.ONE_PAIR],
    ['AS JH 9D 6C 3S', HAND_RANK.HIGH_CARD],
    ['QS KH AD 2C 3S', HAND_RANK.HIGH_CARD], // 돌아가는 스트레이트는 인정 안 함
  ];
  for (const [hand, expected] of cases) {
    it(`${hand}`, () => expect(evaluateHand(h(hand)).rank).toBe(expected));
  }

  it('5장이 아니면 에러', () => {
    expect(() => evaluateHand(h('AS KS QS'))).toThrow();
  });
});

describe('핸드 비교', () => {
  const win = (a, b) => expect(compareHands(h(a), h(b))).toBeGreaterThan(0);

  it('높은 족보가 이긴다', () => win('2S 2H 3D 4C 5H', 'AS KH QD JC 9S'));
  it('휠(A-5)은 6-하이 스트레이트에 진다', () => win('6S 5H 4D 3C 2S', 'AS 2H 3D 4C 5S'));
  it('같은 원페어면 페어 숫자', () => win('9S 9H 2D 3C 4S', '8S 8H AD KC QS'));
  it('같은 페어면 키커', () => win('9S 9H AD 3C 2S', '9D 9C KD QC JS'));
  it('투페어: 높은 페어 → 낮은 페어 → 키커', () => {
    win('KS KH 3D 3C 2S', 'QS QH JD JC AS');
    win('KS KH 4D 4C 2S', 'KD KC 3D 3C AS');
    win('KS KH 4D 4C 5S', 'KD KC 4H 4S 3S');
  });
  it('풀하우스는 트리플 숫자 우선', () => win('4S 4H 4D 2C 2S', '3S 3H 3D AC AS'));
  it('플러시는 높은 카드부터 비교', () => win('AH 9H 7H 4H 3H', 'AC 9C 7C 4C 2C'));
  it('완전히 같으면 무승부(무늬 무시)', () => {
    expect(compareHands(h('AS KH 9D 6C 3S'), h('AD KC 9H 6S 3D'))).toBe(0);
  });
});

describe('덱 배분', () => {
  it('52장 중복 없음', () => {
    const d = createDeck();
    expect(new Set(d.map((c) => c.rank + c.suit)).size).toBe(52);
  });
  it('공개 3장 + 그리드 16장, 서로 중복 없음', () => {
    const { community, grid } = dealRound();
    expect(community).toHaveLength(3);
    expect(grid).toHaveLength(16);
    const all = [...community, ...grid].map((c) => c.rank + c.suit);
    expect(new Set(all).size).toBe(19);
  });
});

import { describeHand, explainResult } from '../src/game/handEvaluator.js';

describe('족보 설명', () => {
  const d = (s) => describeHand(evaluateHand(h(s)));
  it('구체적인 이름', () => {
    expect(d('8S 8H KD 4C 2S')).toBe('8 원페어');
    expect(d('JS JH 4D 4C AS')).toBe('J·4 투페어');
    expect(d('3S 3H 3D 9C 9S')).toBe('3×3 + 9×2 풀하우스');
    expect(d('AC 9C 7C 4C 2C')).toBe('A 하이 플러시');
    expect(d('AS 2H 3D 4C 5S')).toBe('5 하이 스트레이트');
    expect(d('AS JH 9D 6C 3S')).toBe('A 하이카드');
  });
  const ex = (a, b) => explainResult(evaluateHand(h(a)), evaluateHand(h(b)));
  it('족보가 다르면 족보 차이', () => {
    expect(ex('2S 2H 3D 4C 5H', 'AS KH QD JC 9S').detail).toBe('원페어가 하이카드보다 높은 족보');
  });
  it('받침에 맞는 조사', () => {
    expect(ex('QS QH QD 4C 2S', 'JS JH 4D 4C AS').detail).toBe('트리플이 투페어보다 높은 족보');
  });
  it('같은 원페어면 페어 숫자', () => {
    expect(ex('9S 9H 2D 3C 4S', '8S 8H AD KC QS').detail).toBe('페어 숫자 비교 · 9 > 8');
  });
  it('같은 페어면 키커', () => {
    expect(ex('9D 9C KD QC JS', '9S 9H AD 3C 2S').detail).toBe('키커(남은 카드) 비교 · A > K');
  });
  it('투페어 낮은 페어', () => {
    expect(ex('KS KH 3D 3C 2S', 'KD KC 4D 4C AS').detail).toBe('낮은 페어 비교 · 4 > 3');
  });
  it('무승부', () => {
    expect(ex('AS KH 9D 6C 3S', 'AD KC 9H 6S 3D').detail).toContain('무승부');
  });
});

import { GUIDE } from '../src/game/handGuide.js';
import { HAND_NAME_KO } from '../src/game/handEvaluator.js';

describe('족보표 예시 검증', () => {
  it('10개 족보가 강한 순서대로 빠짐없이', () => {
    expect(GUIDE.map((g) => g.rank)).toEqual([9, 8, 7, 6, 5, 4, 3, 2, 1, 0]);
    expect(GUIDE[0].name).toBe('로열 스트레이트 플러시');
  });
  for (const g of GUIDE) {
    it(`${g.name} 예시가 실제로 ${g.name}로 판정됨`, () => {
      expect(g.cards).toHaveLength(5);
      expect(evaluateHand(g.cards).rank).toBe(g.rank);
      expect(evaluateHand(g.cards).name).toBe(HAND_NAME_KO[g.rank]);
    });
    it(`${g.name} 예시는 낮은 숫자→높은 숫자 순`, () => {
      const ranks = g.cards.map((c) => c.rank);
      expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
    });
  }
  it('예시끼리 비교하면 위 족보가 항상 이김', () => {
    for (let i = 0; i < GUIDE.length - 1; i++) {
      expect(compareHands(GUIDE[i].cards, GUIDE[i + 1].cards)).toBeGreaterThan(0);
    }
  });
});

import { findBestPick } from '../src/game/bestPick.js';

describe('이번 판 최고 족보 찾기', () => {
  it('그리드 중 최고 조합을 찾음', () => {
    const community = h('KS KH 4D');
    const grid = h('2C 3D KD 4C 9S 7H AS 5C JD 6H QS 8C 10D 2H 3S 5D 6C 7S 9D JC');
    const best = findBestPick(community, grid);
    expect(best.eval.name).toBe('풀하우스');
    expect(best.indices.map((i) => grid[i].rank).sort((a, b) => a - b)).toEqual([4, 13]); // K + 4 → K·4 풀하우스
  });
  it('어떤 조합보다도 약하지 않음', () => {
    for (let t = 0; t < 30; t++) {
      const { community, grid } = dealRound();
      const best = findBestPick(community, grid);
      for (let i = 0; i < grid.length; i++) for (let j = i + 1; j < grid.length; j++) {
        expect(compareHands(best.cards, [...community, grid[i], grid[j]])).toBeGreaterThanOrEqual(0);
      }
    }
  });
});

import { weakestFill } from '../src/game/autoPick.js';

describe('시간 초과 자동 선택 (가장 약한 카드)', () => {
  it('2장 모두 못 골랐으면 가능한 조합 중 가장 약한 패가 됨', () => {
    for (let t = 0; t < 20; t++) {
      const { community, grid } = dealRound();
      const free = grid.map((_, i) => i);
      const pick = weakestFill(community, grid, [], free, 2);
      expect(pick).toHaveLength(2);
      const mine = [...community, ...pick.map((i) => grid[i])];
      for (let i = 0; i < grid.length; i++) for (let j = i + 1; j < grid.length; j++) {
        expect(compareHands(mine, [...community, grid[i], grid[j]])).toBeLessThanOrEqual(0);
      }
    }
  });
  it('1장만 골랐으면 그 카드는 유지하고 나머지 1장을 가장 약하게', () => {
    const { community, grid } = dealRound();
    const free = grid.map((_, i) => i).filter((i) => i !== 0);
    const pick = weakestFill(community, grid, [0], free, 1);
    expect(pick).toHaveLength(1);
    expect(pick[0]).not.toBe(0);
    const mine = [...community, grid[0], grid[pick[0]]];
    for (const i of free) expect(compareHands(mine, [...community, grid[0], grid[i]])).toBeLessThanOrEqual(0);
  });
  it('남의 카드(빈 칸이 아닌 칸)는 고르지 않음', () => {
    const { community, grid } = dealRound();
    const free = [3, 7, 11, 15];
    for (const i of weakestFill(community, grid, [], free, 2)) expect(free).toContain(i);
  });
});
