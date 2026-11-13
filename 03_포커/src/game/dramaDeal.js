// 극적인 판을 위한 배분.
// 완전 무작위로 나누면 대부분 트리플/투페어/원페어 싸움이 되므로,
// "이번 판 그리드에서 만들 수 있는 최고 족보"를 목표 확률표에 맞춰 고른다.
//  - 공개 3장 + 그리드 2장으로 만드는 족보만 대상
//  - 카드 자체는 여전히 52장 한 덱에서 중복 없이 나오고, 위치도 무작위라 겉보기엔 평범한 배분
import { createDeck, shuffle, COMMUNITY_COUNT, GRID_SIZE } from './deck.js';
import { evaluateHand, HAND_RANK as H } from './handEvaluator.js';

// 목표: 이번 판에 '만들 수 있는' 최고 족보의 확률(%)
// (참고: 완전 무작위일 때 → 로열 0.05, 스티플 0.2, 포카드 3, 풀하우스 9, 플러시 5, 스트레이트 15, 트리플 50, 투페어 15.5, 원페어 3)
export const DRAMA_WEIGHTS = {
  [H.ROYAL_FLUSH]: 1,
  [H.STRAIGHT_FLUSH]: 3,
  [H.FOUR_OF_A_KIND]: 9,
  [H.FULL_HOUSE]: 17,
  [H.FLUSH]: 15,
  [H.STRAIGHT]: 20,
  [H.THREE_OF_A_KIND]: 25,
  [H.TWO_PAIR]: 8,
  [H.ONE_PAIR]: 2,
};

const MAX_TRIES = 400; // 목표 족보가 나오는 배분을 찾을 때 최대 시도 횟수
const PICK_FROM = 6; // 조건에 맞는 배분을 이만큼 모은 뒤, 그 족보를 만드는 조합이 가장 많은 것을 고름

/** 그리드의 2장 조합(16장 → 120가지)을 모두 따져, 최고 족보와 족보별 조합 수를 구함 */
export function analyzeDeal(community, grid) {
  const combos = Array(10).fill(0);
  let best = 0;
  for (let i = 0; i < grid.length; i++) {
    for (let j = i + 1; j < grid.length; j++) {
      const r = evaluateHand([...community, grid[i], grid[j]]).rank;
      combos[r]++;
      if (r > best) best = r;
    }
  }
  return { best, combos };
}

function pickWeighted(weights, rng) {
  const entries = Object.entries(weights).map(([k, w]) => [Number(k), w]);
  const total = entries.reduce((s, [, w]) => s + w, 0);
  let x = rng() * total;
  for (const [k, w] of entries) {
    if ((x -= w) < 0) return k;
  }
  return entries[entries.length - 1][0];
}

const sameCard = (a, b) => a.rank === b.rank && a.suit === b.suit;

// 아주 드문 족보(포카드 이상)는 무작위로 찾기 어려우므로 5장을 먼저 정하고
// 그중 3장은 공개 카드, 2장은 그리드의 무작위 위치에 섞어 넣는다.
function buildRareHand(target, rng) {
  const suits = ['S', 'H', 'D', 'C'];
  const suit = suits[Math.floor(rng() * 4)];
  let five;
  if (target === H.ROYAL_FLUSH) {
    five = [10, 11, 12, 13, 14].map((rank) => ({ rank, suit }));
  } else if (target === H.STRAIGHT_FLUSH) {
    const high = 6 + Math.floor(rng() * 8); // 6~13 하이 (로열 제외)
    five = [0, 1, 2, 3, 4].map((d) => ({ rank: high - d, suit }));
  } else {
    // 포카드: 같은 숫자 4장 + 아무 1장
    const rank = 2 + Math.floor(rng() * 13);
    const four = suits.map((s) => ({ rank, suit: s }));
    const rest = createDeck().filter((c) => c.rank !== rank);
    five = [...four, rest[Math.floor(rng() * rest.length)]];
  }
  const shuffledFive = shuffle(five, rng);
  const community = shuffledFive.slice(0, COMMUNITY_COUNT);
  const planted = shuffledFive.slice(COMMUNITY_COUNT);
  const others = shuffle(
    createDeck().filter((c) => !five.some((f) => sameCard(f, c))),
    rng,
  ).slice(0, GRID_SIZE - planted.length);
  const grid = shuffle([...others, ...planted], rng);
  return { community, grid };
}

function randomDeal(rng) {
  const deck = shuffle(createDeck(), rng);
  return {
    community: deck.slice(0, COMMUNITY_COUNT),
    grid: deck.slice(COMMUNITY_COUNT, COMMUNITY_COUNT + GRID_SIZE),
  };
}

/**
 * 극적인 판 배분. dealRound()와 같은 모양 { community, grid } 를 돌려줌.
 * @param {() => number} rng
 */
export function dealDramaticRound(rng = Math.random, weights = DRAMA_WEIGHTS) {
  const target = pickWeighted(weights, rng);

  if (target >= H.FOUR_OF_A_KIND) return buildRareHand(target, rng);

  const matches = [];
  let fallback = null;
  for (let t = 0; t < MAX_TRIES && matches.length < PICK_FROM; t++) {
    const deal = randomDeal(rng);
    const info = analyzeDeal(deal.community, deal.grid);
    if (info.best === target) {
      matches.push({ deal, score: info.combos[target] });
    } else if (!fallback || Math.abs(info.best - target) < Math.abs(fallback.best - target)) {
      fallback = { deal, best: info.best };
    }
  }
  if (matches.length === 0) return fallback.deal;
  // 목표 족보를 만드는 조합이 가장 많은 배분 → 기억만 잘하면 실제로 손에 넣을 기회가 커짐
  matches.sort((a, b) => b.score - a.score);
  return matches[0].deal;
}
