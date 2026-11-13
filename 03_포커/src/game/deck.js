// 52장 덱 생성 · 셔플 · 배분
export const SUITS = ['S', 'H', 'D', 'C']; // 스페이드, 하트, 다이아, 클로버
export const RANKS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]; // 11=J, 12=Q, 13=K, 14=A

export const SUIT_SYMBOL = { S: '♠', H: '♥', D: '♦', C: '♣' };
export const RANK_LABEL = { 11: 'J', 12: 'Q', 13: 'K', 14: 'A' };

export function createDeck() {
  const deck = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) deck.push({ rank, suit });
  }
  return deck;
}

// Fisher–Yates 셔플 (원본을 바꾸지 않음). rng는 테스트용으로 주입 가능.
export function shuffle(cards, rng = Math.random) {
  const a = cards.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export const COMMUNITY_COUNT = 3;
export const GRID_SIZE = 20; // 5열 × 4행

// 한 판에 필요한 카드 배분: 공개 3장 + 그리드 20장 (중복 없음)
export function dealRound(rng = Math.random) {
  const deck = shuffle(createDeck(), rng);
  return {
    community: deck.slice(0, COMMUNITY_COUNT),
    grid: deck.slice(COMMUNITY_COUNT, COMMUNITY_COUNT + GRID_SIZE),
  };
}

export function cardLabel(card) {
  return `${RANK_LABEL[card.rank] ?? card.rank}${SUIT_SYMBOL[card.suit]}`;
}
