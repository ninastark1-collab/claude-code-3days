// 시간 안에 2장을 다 고르지 못했을 때: 남은 칸 중 '가장 약한 패'가 되는 카드로 채움 (불이익)
import { evaluateHand, compareHands } from './handEvaluator.js';

/**
 * @param {object[]} community 공개 3장
 * @param {object[]} grid      그리드 카드
 * @param {number[]} picked    이미 고른 칸 번호
 * @param {number[]} free      아직 아무도 안 고른 칸 번호
 * @param {number} need        더 채워야 할 장수 (1 또는 2)
 * @returns {number[]} 채울 칸 번호
 */
export function weakestFill(community, grid, picked, free, need) {
  if (need <= 0) return [];
  const base = [...community, ...picked.map((i) => grid[i])];
  let worst = null;
  const consider = (idxs) => {
    const ev = evaluateHand([...base, ...idxs.map((i) => grid[i])]);
    if (!worst || compareHands(ev, worst.ev) < 0) worst = { idxs, ev };
  };
  if (need === 1) {
    for (const i of free) consider([i]);
  } else {
    for (let a = 0; a < free.length; a++) for (let b = a + 1; b < free.length; b++) consider([free[a], free[b]]);
  }
  return worst.idxs;
}
