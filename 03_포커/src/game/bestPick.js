// 이번 판에서 '무엇을 골랐어야 최고 족보가 되는지' 찾기
import { evaluateHand, compareHands } from './handEvaluator.js';

/**
 * 공개 3장 + 그리드 2장으로 만들 수 있는 가장 강한 패.
 * @returns {{ indices: [number, number], cards: object[], eval: object }}
 */
export function findBestPick(community, grid) {
  let best = null;
  for (let i = 0; i < grid.length; i++) {
    for (let j = i + 1; j < grid.length; j++) {
      const cards = [...community, grid[i], grid[j]];
      const ev = evaluateHand(cards);
      if (!best || compareHands(ev, best.eval) > 0) best = { indices: [i, j], cards, eval: ev };
    }
  }
  return best;
}
