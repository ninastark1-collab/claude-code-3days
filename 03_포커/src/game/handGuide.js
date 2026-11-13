// 족보표 데이터 (위가 강함). 이름은 판정 로직(HAND_NAME_KO)과 같은 것을 써서 어긋나지 않게 함.
// 예시에서 '*' 가 붙은 카드가 족보를 만드는 핵심 카드.
import { HAND_RANK, HAND_NAME_KO } from './handEvaluator.js';

const EXAMPLES = [
  [HAND_RANK.ROYAL_FLUSH, '*10S *JS *QS *KS *AS'],
  [HAND_RANK.STRAIGHT_FLUSH, '*5H *6H *7H *8H *9H'],
  [HAND_RANK.FOUR_OF_A_KIND, '2S *7S *7H *7D *7C'],
  [HAND_RANK.FULL_HOUSE, '*4C *4S *KS *KH *KD'],
  [HAND_RANK.FLUSH, '*2D *5D *8D *JD *AD'],
  [HAND_RANK.STRAIGHT, '*5C *6H *7S *8D *9C'],
  [HAND_RANK.THREE_OF_A_KIND, '3D 7C *QS *QH *QD'],
  [HAND_RANK.TWO_PAIR, '*4D *4C *JS *JH AS'],
  [HAND_RANK.ONE_PAIR, '2S 5C *8S *8H KD'],
  [HAND_RANK.HIGH_CARD, '3C 5S 8D JC *AH'],
];

const RANK_FROM_LABEL = { J: 11, Q: 12, K: 13, A: 14 };

export function parseExample(ex) {
  return ex.split(' ').map((t) => {
    const key = t.startsWith('*');
    const body = key ? t.slice(1) : t;
    const r = body.slice(0, -1);
    return { rank: RANK_FROM_LABEL[r] ?? Number(r), suit: body.slice(-1), key };
  });
}

export const GUIDE = EXAMPLES.map(([rank, ex]) => ({
  rank,
  name: HAND_NAME_KO[rank],
  cards: parseExample(ex),
}));
