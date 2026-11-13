// 혼자 연습: 나 vs 컴퓨터(무작위로 고름). 규칙은 온라인과 같은 match.js 사용
import { dealRound, GRID_SIZE } from '../game/deck.js';
import { dealDramaticRound } from '../game/dramaDeal.js';
import { applyPick, picksByPlayer, finishRound, PICKS_PER_PLAYER } from '../game/match.js';
import { evaluateHand, compareHands } from '../game/handEvaluator.js';
import * as B from '../ui/board.js';
import { play } from '../ui/sound.js';
import { ownersFrom, guideHighlights, resultView } from './common.js';

const params = new URLSearchParams(location.search);
const MEMORIZE_SECONDS = Number(params.get('m') || params.get('t')) || 30;
const PICK_SECONDS = Number(params.get('p') || params.get('t')) || 15;
const READY_SECONDS = 3;
// 높은 족보가 더 자주 나오도록 보정한 배분. ?deal=fair 면 완전 무작위
const deal = params.get('deal') === 'fair' ? dealRound : dealDramaticRound;

// 컴퓨터가 외우는 비율 (사람처럼 일부만 기억) — 높을수록 강함
const BOT_MEMORY = 0.4; // 시뮬레이션: 40%면 투페어~스트레이트급을 자주 만듦 (아무거나 고를 때는 대부분 원페어 이하)

const ME = 'me';
const BOT = 'bot';

const s = {
  active: false,
  phase: 'WAITING',
  community: [],
  grid: [],
  picks: {},
  seq: 0,
  players: [
    { id: ME, seat: 0, nickname: '나', wins: 0 },
    { id: BOT, seat: 1, nickname: '컴퓨터', wins: 0 },
  ],
  result: null,
  timers: [],
};
const info = () => Object.fromEntries(s.players.map((p) => [p.id, p]));
const myCells = () => picksByPlayer(s.picks)[ME] ?? [];

function clearTimers() {
  s.timers.forEach((id) => { clearTimeout(id); clearInterval(id); });
  s.timers = [];
  B.showCountdown(null);
}

function runCountdown(seconds, step, label, onDone) {
  const end = performance.now() + seconds * 1000;
  const tick = () => {
    const left = Math.max(0, end - performance.now());
    B.setStatus(step, typeof label === 'function' ? label() : label, Math.ceil(left / 1000), left / (seconds * 1000));
    if (left <= 0) {
      clearInterval(id);
      onDone();
    }
  };
  const id = setInterval(tick, 100);
  s.timers.push(id);
  tick();
}

function drawPlayers() {
  const counts = picksByPlayer(s.picks);
  B.drawPlayers(
    s.players.map((p) => ({
      ...p,
      me: p.id === ME,
      picks: (counts[p.id] ?? []).length,
      place: s.phase === 'SHOWDOWN' ? s.result?.ranking.find((r) => r.id === p.id)?.place : undefined,
    })),
    { showPicks: s.phase === 'PICK' },
  );
}

function drawPickGrid() {
  B.drawGrid({
    cards: s.grid,
    faceDown: true,
    owners: ownersFrom(s.picks, ME, info()),
    clickable: (i) => !s.picks[i] || s.picks[i].p === ME,
    onPick: (i) => tryPick(ME, i),
  });
}

const pickLabel = () => (myCells().length < PICKS_PER_PLAYER ? '2장을 고르세요' : '선택 완료 · 변경 가능');

// ---------- 흐름 ----------
export function enterPractice(nickname) {
  s.active = true;
  s.players[0].nickname = nickname || '나';
  resetToWaiting();
}

export function leavePractice() {
  s.active = false;
  clearTimers();
  B.hideResult();
}

function resetToWaiting() {
  clearTimers();
  s.phase = 'WAITING';
  s.picks = {};
  s.result = null;
  B.hideResult();
  B.drawIdleBoard();
  B.renderGuide();
  drawPlayers();
  B.setStatus('READY', '게임 시작을 눌러주세요');
  B.showPlayButton('게임 시작', { onClick: startRound });
  B.fitToScreen();
}

function startRound() {
  clearTimers();
  B.hidePlayButton();
  const d = deal();
  Object.assign(s, { community: d.community, grid: d.grid, picks: {}, seq: 0, result: null, phase: 'COUNTDOWN' });
  B.hideResult();
  B.renderGuide();
  B.drawCommunity(s.community, { faceDown: true });
  B.drawGrid({ cards: s.grid, faceDown: true });
  B.drawMyPicks([]);
  drawPlayers();

  // 3 → 2 → 1
  let n = READY_SECONDS;
  const show = () => {
    B.showCountdown(n);
    B.setStatus('GET READY', '곧 시작합니다', n, n / READY_SECONDS);
  };
  show();
  const id = setInterval(() => {
    n -= 1;
    if (n > 0) return show();
    clearInterval(id);
    B.showCountdown(null);
    startMemorize();
  }, 1000);
  s.timers.push(id);
}

function startMemorize() {
  s.phase = 'MEMORIZE';
  // 컴퓨터가 기억한 칸 (나머지는 잊어버림)
  s.botMemory = new Set(s.grid.map((_, i) => i).filter(() => Math.random() < BOT_MEMORY));
  B.flipGrid(false);
  runCountdown(MEMORIZE_SECONDS, 'MEMORIZE', `${GRID_SIZE}장을 외우세요`, startPick);
}

function startPick() {
  s.phase = 'PICK';
  B.flipGrid(true);
  B.flipCommunity(false);
  s.timers.push(setTimeout(drawPickGrid, 650)); // 뒤집기 애니메이션 후 누를 수 있는 판으로
  drawPlayers();
  scheduleBot();
  runCountdown(PICK_SECONDS, 'SELECT', pickLabel, finish);
}

function tryPick(who, cell) {
  if (s.phase !== 'PICK' || cell === undefined) return;
  const r = applyPick(s.picks, s.seq, who, cell);
  if (!r.ok) return;
  s.picks = r.picks;
  s.seq = r.seq;
  if (who === ME) {
    play(s.picks[cell]?.p === ME ? 'pick' : 'unpick');
    try { navigator.vibrate?.(15); } catch {}
  }
  drawPickGrid();
  B.drawMyPicks(myCells().map((i) => s.grid[i]));
  drawPlayers();
  if (who === ME) B.setPhaseText(pickLabel());
}

// 컴퓨터: 선택 시간 중 두 번, 기억나는 카드 중 가장 좋은 패가 되는 카드를 고름
function scheduleBot() {
  for (let k = 0; k < PICKS_PER_PLAYER; k++) {
    const delay = (0.25 + k * 0.3 + Math.random() * 0.3) * PICK_SECONDS * 1000;
    s.timers.push(setTimeout(botMove, delay));
  }
}

function botMove() {
  if (s.phase !== 'PICK') return;
  const held = picksByPlayer(s.picks)[BOT] ?? [];
  if (held.length >= PICKS_PER_PLAYER) return;
  const free = s.grid.map((_, i) => i).filter((i) => !s.picks[i]);
  const known = free.filter((i) => s.botMemory?.has(i));
  const handOf = (cells) => evaluateHand([...s.community, ...cells.map((i) => s.grid[i])]);
  let choice = null;
  if (held.length === 1) {
    // 이미 1장 있음 → 기억나는 카드 중 짝이 가장 좋은 것
    let best = null;
    for (const i of known) {
      const ev = handOf([held[0], i]);
      if (!best || compareHands(ev, best.ev) > 0) best = { i, ev };
    }
    choice = best?.i;
  } else {
    // 기억나는 카드 2장 조합 중 가장 강한 패의 한 장
    let best = null;
    for (let a = 0; a < known.length; a++) for (let b = a + 1; b < known.length; b++) {
      const ev = handOf([known[a], known[b]]);
      if (!best || compareHands(ev, best.ev) > 0) best = { i: known[a], ev };
    }
    choice = best?.i ?? known[0];
  }
  if (choice === undefined) choice = free[Math.floor(Math.random() * free.length)]; // 기억이 안 나면 아무거나
  tryPick(BOT, choice);
}

function finish() {
  if (s.phase !== 'PICK') return;
  clearTimers();
  const result = finishRound({ community: s.community, grid: s.grid, picks: s.picks, players: s.players });
  result.ranking = result.ranking.map((r) => ({ ...r, nickname: info()[r.id].nickname, seat: info()[r.id].seat }));
  s.result = result;
  s.picks = result.picks;
  s.phase = 'SHOWDOWN';
  if (!result.draw) info()[result.winners[0]].wins++;
  showShowdown();
}

function showShowdown() {
  const owners = ownersFrom(s.picks, ME, info());
  B.setStatus('SHOWDOWN', '내 패 = 공개 3장 + 내 카드 2장');
  B.drawGrid({ cards: s.grid, faceDown: false, owners, best: s.result.best.cells });
  B.drawCommunity(s.community, { reveal: true });
  B.drawMyPicks(myCells().map((i) => s.grid[i]), { flipIn: true, reveal: true });
  B.renderGuide(guideHighlights(s.result, ME));
  drawPlayers();
  s.timers.push(
    setTimeout(() => {
      B.showResult(resultView({ result: s.result, meId: ME, owners, nextLabel: '새 게임', onNext: resetToWaiting }));
      B.showPlayButton('새 게임', { atBottom: true, onClick: resetToWaiting });
    }, B.REVEAL_MS),
  );
}

export const practiceTimes = { MEMORIZE_SECONDS, PICK_SECONDS };
