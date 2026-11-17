// 한 판의 규칙 (서버 Edge Function 과 혼자 연습 모드가 똑같이 사용)
// 모든 값은 JSON 으로 주고받을 수 있는 순수 데이터.
//   picks: { "칸번호": [{ p: 플레이어id, t: 고른 순서 }, ...] }  (같은 칸을 여러 명이 고를 수 있음)
import { evaluateHand, compareHands, describeHand, explainResult } from './handEvaluator.js';
import { weakestFill } from './autoPick.js';
import { findBestPick } from './bestPick.js';

export const PICKS_PER_PLAYER = 2;
export const MAX_PLAYERS = 4;

/** 플레이어별로 고른 칸 (고른 순서대로) */
export function picksByPlayer(picks) {
  const out = {};
  for (const [cell, owners] of Object.entries(picks)) {
    for (const { p, t } of owners) (out[p] ??= []).push({ cell: Number(cell), t });
  }
  for (const p of Object.keys(out)) out[p] = out[p].sort((a, b) => a.t - b.t).map((x) => x.cell);
  return out;
}

/** 칸에서 플레이어의 선택만 뺌 (남은 사람이 없으면 칸 자체를 지움) */
function withoutOwner(picks, cell, playerId) {
  const key = String(cell);
  const rest = (picks[key] ?? []).filter((o) => o.p !== playerId);
  if (rest.length) picks[key] = rest;
  else delete picks[key];
}

/**
 * 카드 고르기 규칙 (DB 함수 poker_pick 과 동일)
 *  - 내 카드를 다시 고르면 취소
 *  - 이미 2장이면 가장 먼저 고른 카드를 빼고 교체
 *  - 다른 사람이 고른 칸도 고를 수 있음 (같은 카드를 여러 명이 가질 수 있음)
 */
export function applyPick(picks, seq, playerId, cell) {
  const key = String(cell);
  const next = { ...picks };
  if ((picks[key] ?? []).some((o) => o.p === playerId)) {
    withoutOwner(next, cell, playerId);
    return { ok: true, picks: next, seq };
  }
  const mine = picksByPlayer(picks)[playerId] ?? [];
  if (mine.length >= PICKS_PER_PLAYER) withoutOwner(next, mine[0], playerId);
  next[key] = [...(next[key] ?? []), { p: playerId, t: seq + 1 }];
  return { ok: true, picks: next, seq: seq + 1 };
}

/**
 * 선택 시간이 끝났을 때: 못 고른 사람은 가장 약한 카드로 채우고, 순위를 매김
 * @param {{community, grid, picks, players: {id, seat}[]}} round
 */
export function finishRound({ community, grid, picks, players }) {
  const filled = { ...picks };
  let seq = Math.max(0, ...Object.values(picks).flat().map((x) => x.t));
  const auto = {};
  // 자리 순서대로 채움 (공평하게 매번 같은 순서)
  for (const pl of [...players].sort((a, b) => a.seat - b.seat)) {
    const mine = picksByPlayer(filled)[pl.id] ?? [];
    const need = PICKS_PER_PLAYER - mine.length;
    if (need <= 0) continue;
    const free = grid.map((_, i) => i).filter((i) => !mine.includes(i)); // 남이 고른 칸도 가능
    for (const cell of weakestFill(community, grid, mine, free, need)) {
      filled[String(cell)] = [...(filled[String(cell)] ?? []), { p: pl.id, t: ++seq }];
    }
    auto[pl.id] = need;
  }

  const byPlayer = picksByPlayer(filled);
  const hands = players.map((pl) => {
    const cells = byPlayer[pl.id] ?? [];
    const cards = [...community, ...cells.map((i) => grid[i])];
    const ev = evaluateHand(cards);
    return { id: pl.id, cells, cards, eval: ev, desc: describeHand(ev), auto: auto[pl.id] ?? 0 };
  });
  hands.sort((a, b) => compareHands(b.eval, a.eval));
  for (const h of hands) h.place = 1 + hands.filter((o) => compareHands(o.eval, h.eval) > 0).length;

  const winners = hands.filter((h) => h.place === 1).map((h) => h.id);
  const verdict =
    hands.length >= 2 ? explainResult(hands[0].eval, hands[1].eval) : null; // 1등 vs 2등(공동 1등이면 무승부 설명)

  const best = findBestPick(community, grid);
  return {
    picks: filled,
    ranking: hands,
    winners,
    draw: winners.length > 1,
    verdict,
    best: { cells: best.indices, cards: best.cards, eval: best.eval, desc: describeHand(best.eval) },
  };
}
