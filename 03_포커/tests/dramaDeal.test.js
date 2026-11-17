import { describe, it, expect } from 'vitest';
import { dealDramaticRound, analyzeDeal } from '../src/game/dramaDeal.js';
import { HAND_RANK as H } from '../src/game/handEvaluator.js';

describe('극적인 배분', () => {
  const N = 300;
  const deals = Array.from({ length: N }, () => dealDramaticRound());

  it('항상 공개 3장 + 그리드 16장, 52장 한 덱에서 중복 없음', () => {
    for (const { community, grid } of deals) {
      expect(community).toHaveLength(3);
      expect(grid).toHaveLength(16);
      const ids = [...community, ...grid].map((c) => `${c.rank}${c.suit}`);
      expect(new Set(ids).size).toBe(19);
      for (const c of [...community, ...grid]) {
        expect(c.rank).toBeGreaterThanOrEqual(2);
        expect(c.rank).toBeLessThanOrEqual(14);
        expect('SHDC').toContain(c.suit);
      }
    }
  });

  it('스트레이트 이상을 만들 수 있는 판이 무작위(약 32%)보다 확실히 많음', () => {
    const strong = deals.filter(({ community, grid }) => analyzeDeal(community, grid).best >= H.STRAIGHT).length;
    expect(strong / N).toBeGreaterThan(0.5);
  });
});
