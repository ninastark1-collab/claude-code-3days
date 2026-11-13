// 5장 포커 족보 판정 + 비교

export const HAND_RANK = {
  HIGH_CARD: 0,
  ONE_PAIR: 1,
  TWO_PAIR: 2,
  THREE_OF_A_KIND: 3,
  STRAIGHT: 4,
  FLUSH: 5,
  FULL_HOUSE: 6,
  FOUR_OF_A_KIND: 7,
  STRAIGHT_FLUSH: 8,
  ROYAL_FLUSH: 9,
};

export const HAND_NAME_KO = [
  '하이카드',
  '원페어',
  '투페어',
  '트리플',
  '스트레이트',
  '플러시',
  '풀하우스',
  '포카드',
  '스트레이트 플러시',
  '로열 스트레이트 플러시',
];

/**
 * 5장을 평가한다.
 * @returns {{ rank: number, name: string, tiebreak: number[] }}
 *   tiebreak: 같은 족보끼리 비교할 숫자 목록 (앞에서부터 비교)
 */
export function evaluateHand(cards) {
  if (!Array.isArray(cards) || cards.length !== 5) {
    throw new Error('evaluateHand는 정확히 5장이 필요합니다');
  }

  const ranks = cards.map((c) => c.rank).sort((a, b) => b - a);
  const isFlush = cards.every((c) => c.suit === cards[0].suit);

  // 스트레이트 판정 (A-2-3-4-5 '휠' 포함, 이때 최고 카드는 5)
  const unique = [...new Set(ranks)];
  let straightHigh = 0;
  if (unique.length === 5) {
    if (unique[0] - unique[4] === 4) straightHigh = unique[0];
    else if (unique.join() === '14,5,4,3,2') straightHigh = 5;
  }

  // 같은 숫자 묶기: [개수, 숫자] 를 개수 내림차순 → 숫자 내림차순
  const counts = new Map();
  for (const r of ranks) counts.set(r, (counts.get(r) ?? 0) + 1);
  const groups = [...counts.entries()]
    .map(([rank, count]) => ({ rank, count }))
    .sort((a, b) => b.count - a.count || b.rank - a.rank);
  const pattern = groups.map((g) => g.count).join('');
  const byGroup = groups.map((g) => g.rank);

  let rank;
  let tiebreak;
  if (straightHigh && isFlush) {
    rank = straightHigh === 14 ? HAND_RANK.ROYAL_FLUSH : HAND_RANK.STRAIGHT_FLUSH;
    tiebreak = [straightHigh];
  } else if (pattern === '41') {
    rank = HAND_RANK.FOUR_OF_A_KIND;
    tiebreak = byGroup;
  } else if (pattern === '32') {
    rank = HAND_RANK.FULL_HOUSE;
    tiebreak = byGroup;
  } else if (isFlush) {
    rank = HAND_RANK.FLUSH;
    tiebreak = ranks;
  } else if (straightHigh) {
    rank = HAND_RANK.STRAIGHT;
    tiebreak = [straightHigh];
  } else if (pattern === '311') {
    rank = HAND_RANK.THREE_OF_A_KIND;
    tiebreak = byGroup;
  } else if (pattern === '221') {
    rank = HAND_RANK.TWO_PAIR;
    tiebreak = byGroup;
  } else if (pattern === '2111') {
    rank = HAND_RANK.ONE_PAIR;
    tiebreak = byGroup;
  } else {
    rank = HAND_RANK.HIGH_CARD;
    tiebreak = ranks;
  }

  return { rank, name: HAND_NAME_KO[rank], tiebreak };
}

/** a가 이기면 양수, b가 이기면 음수, 비기면 0 (무늬는 비교하지 않음) */
export function compareHands(a, b) {
  const ea = a.rank !== undefined && a.tiebreak ? a : evaluateHand(a);
  const eb = b.rank !== undefined && b.tiebreak ? b : evaluateHand(b);
  if (ea.rank !== eb.rank) return ea.rank - eb.rank;
  for (let i = 0; i < Math.max(ea.tiebreak.length, eb.tiebreak.length); i++) {
    const d = (ea.tiebreak[i] ?? 0) - (eb.tiebreak[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

// ---------- 플레이어에게 보여줄 설명 ----------
const LABEL = { 11: 'J', 12: 'Q', 13: 'K', 14: 'A' };
const rl = (r) => LABEL[r] ?? String(r);
// 받침이 있으면 '이', 없으면 '가'
const iGa = (word) => {
  const code = word.charCodeAt(word.length - 1) - 0xac00;
  return word + (code >= 0 && code <= 11171 && code % 28 !== 0 ? '이' : '가');
};

/** "8 원페어", "J·4 투페어", "K 하이 플러시" 처럼 어떤 족보인지 구체적으로 */
export function describeHand(ev) {
  const t = ev.tiebreak;
  switch (ev.rank) {
    case HAND_RANK.ROYAL_FLUSH: return '로열 스트레이트 플러시';
    case HAND_RANK.STRAIGHT_FLUSH: return `${rl(t[0])} 하이 스트레이트 플러시`;
    case HAND_RANK.FOUR_OF_A_KIND: return `${rl(t[0])} 포카드`;
    case HAND_RANK.FULL_HOUSE: return `${rl(t[0])}×3 + ${rl(t[1])}×2 풀하우스`;
    case HAND_RANK.FLUSH: return `${rl(t[0])} 하이 플러시`;
    case HAND_RANK.STRAIGHT: return `${rl(t[0])} 하이 스트레이트`;
    case HAND_RANK.THREE_OF_A_KIND: return `${rl(t[0])} 트리플`;
    case HAND_RANK.TWO_PAIR: return `${rl(t[0])}·${rl(t[1])} 투페어`;
    case HAND_RANK.ONE_PAIR: return `${rl(t[0])} 원페어`;
    default: return `${rl(t[0])} 하이카드`;
  }
}

// 같은 족보일 때 tiebreak 각 자리가 무엇을 뜻하는지
const PART_NAMES = {
  [HAND_RANK.STRAIGHT_FLUSH]: ['가장 높은 카드'],
  [HAND_RANK.FOUR_OF_A_KIND]: ['포카드 숫자', '키커(남은 카드)'],
  [HAND_RANK.FULL_HOUSE]: ['트리플 숫자', '페어 숫자'],
  [HAND_RANK.FLUSH]: ['가장 높은 카드', '두 번째 카드', '세 번째 카드', '네 번째 카드', '다섯 번째 카드'],
  [HAND_RANK.STRAIGHT]: ['가장 높은 카드'],
  [HAND_RANK.THREE_OF_A_KIND]: ['트리플 숫자', '키커(남은 카드)', '두 번째 키커'],
  [HAND_RANK.TWO_PAIR]: ['높은 페어', '낮은 페어', '키커(남은 카드)'],
  [HAND_RANK.ONE_PAIR]: ['페어 숫자', '키커(남은 카드)', '두 번째 키커', '세 번째 키커'],
  [HAND_RANK.HIGH_CARD]: ['가장 높은 카드', '두 번째 카드', '세 번째 카드', '네 번째 카드', '다섯 번째 카드'],
};

/**
 * 왜 이겼는지/비겼는지 한 줄 설명. a 기준 (a = 나).
 * @returns {{ headline: string, detail: string }}
 */
export function explainResult(a, b) {
  if (a.rank !== b.rank) {
    const [hi, lo] = a.rank > b.rank ? [a, b] : [b, a];
    return { headline: '족보 차이', detail: `${iGa(hi.name)} ${lo.name}보다 높은 족보` };
  }
  const parts = PART_NAMES[a.rank] ?? [];
  for (let i = 0; i < a.tiebreak.length; i++) {
    if (a.tiebreak[i] !== b.tiebreak[i]) {
      const [hi, lo] = a.tiebreak[i] > b.tiebreak[i] ? [a, b] : [b, a];
      return {
        headline: `둘 다 ${a.name}`,
        detail: `${parts[i] ?? '카드'} 비교 · ${rl(hi.tiebreak[i])} > ${rl(lo.tiebreak[i])}`,
      };
    }
  }
  return { headline: `둘 다 ${describeHand(a)}`, detail: '숫자가 모두 같아 무승부 (무늬는 비교하지 않아요)' };
}
