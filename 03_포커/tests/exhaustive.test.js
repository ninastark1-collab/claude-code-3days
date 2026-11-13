import { it, expect } from 'vitest';
import { createDeck } from '../src/game/deck.js';
import { evaluateHand, HAND_NAME_KO } from '../src/game/handEvaluator.js';

// 52장에서 나올 수 있는 5장 조합 2,598,960개를 전부 판정해서
// 수학적으로 알려진 족보별 개수와 정확히 같은지 확인
const EXPECTED = [1302540, 1098240, 123552, 54912, 10200, 5108, 3744, 624, 36, 4];

it('전체 2,598,960가지 패의 족보별 개수가 정답과 일치', () => {
  const deck = createDeck();
  const counts = Array(10).fill(0);
  const hand = new Array(5);
  for (let a = 0; a < 48; a++) for (let b = a + 1; b < 49; b++) for (let c = b + 1; c < 50; c++)
    for (let d = c + 1; d < 51; d++) for (let e = d + 1; e < 52; e++) {
      hand[0] = deck[a]; hand[1] = deck[b]; hand[2] = deck[c]; hand[3] = deck[d]; hand[4] = deck[e];
      counts[evaluateHand(hand).rank]++;
    }
  console.table(HAND_NAME_KO.map((n, i) => ({ 족보: n, 개수: counts[i], 정답: EXPECTED[i] })));
  expect(counts).toEqual(EXPECTED);
}, 120000);
