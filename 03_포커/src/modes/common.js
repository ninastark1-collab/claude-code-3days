// 연습/온라인 공통: 서버(또는 연습 모드)의 판 데이터 → 화면에 그릴 값으로 변환
import { compareHands } from '../game/handEvaluator.js';
import { ownersByCell } from '../game/match.js';
import { bestNote } from '../ui/board.js';

export const initial = (name) => [...(name ?? '?')][0];

/**
 * picks → 카드판 이름표 { 칸: [{seat, label, me, name}, ...] }
 * 같은 칸을 여러 명이 고를 수 있으므로 칸마다 이름표가 여러 개일 수 있음 (내 것이 맨 앞)
 */
export function ownersFrom(picks, meId, infoById) {
  const out = {};
  for (const [cell, ids] of Object.entries(ownersByCell(picks))) {
    out[cell] = ids
      .map((p) => {
        const info = infoById[p] ?? { nickname: '?', seat: 0 };
        return { seat: info.seat, me: p === meId, name: info.nickname, label: p === meId ? '나' : initial(info.nickname) };
      })
      .sort((a, b) => Number(b.me) - Number(a.me));
  }
  return out;
}

/** 족보표에 표시할 이름표 */
export function guideHighlights(result, meId) {
  return result.ranking.map((r) => ({
    rank: r.eval.rank,
    seat: r.seat,
    me: r.id === meId,
    label: r.id === meId ? '나' : initial(r.nickname),
  }));
}

/** 결과 창에 넘길 값 */
export function resultView({ result, meId, owners, nextLabel, onNext }) {
  const me = result.ranking.find((r) => r.id === meId);
  const many = result.ranking.length > 2;
  const outcome = !me ? 'lose' : me.place === 1 ? (result.draw ? 'draw' : 'win') : 'lose';
  const title =
    outcome === 'win' ? '승리' : outcome === 'draw' ? (many ? '공동 1등' : '무승부') : many ? `${me?.place ?? '-'}등` : '패배';
  const verdict = result.verdict && {
    headline: result.verdict.headline,
    detail: result.verdict.detail + (result.draw ? ' · 전적에 포함되지 않아요' : ''),
  };
  return {
    outcome,
    eyebrow: { win: 'VICTORY', draw: 'DRAW', lose: 'DEFEAT' }[outcome],
    title,
    hands: result.ranking.map((r) => ({
      name: r.nickname,
      seat: r.seat,
      me: r.id === meId,
      place: r.place,
      desc: r.desc,
      eval: r.eval,
      cards: r.cards,
      picked: r.cards.slice(3),
      auto: r.auto,
    })),
    best: {
      desc: result.best.desc,
      eval: result.best.eval,
      cards: result.best.cards,
      picked: result.best.cards.slice(3),
      made: !!me && compareHands(me.eval, result.best.eval) === 0,
      note: bestNote(result.best.cells, me?.cells ?? [], owners, me && compareHands(me.eval, result.best.eval) === 0),
    },
    verdict,
    nextLabel,
    onNext,
  };
}
