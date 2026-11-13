// 게임 화면 그리기 (연습/온라인 공통). 게임 진행 로직은 없고, 받은 값대로 화면만 바꿈.
import { HAND_RANK } from '../game/handEvaluator.js';
import { GUIDE } from '../game/handGuide.js';
import { GRID_SIZE, GRID_COLS } from '../game/deck.js';
import { PICKS_PER_PLAYER } from '../game/match.js';
import { cardEl, renderRow, flipAll, suitSvg, isRed, rankHtml, BLANK_CARD, sameCard } from './cards.js';
import { play, buzz, isMuted, setMuted } from './sound.js';

const $ = (id) => document.getElementById(id);
const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];
const RING_LEN = 119.4; // 2πr (r=19)
export const REVEAL_MS = 2500; // 결과 창 전에 공개 3장 + 내 카드 2장을 보여주는 시간

const el = {
  guide: $('guide'),
  guideList: $('guide-list'),
  community: $('community'),
  grid: $('grid'),
  myPicks: $('my-picks'),
  pickCount: $('pick-count'),
  phaseStep: $('phase-step'),
  phaseText: $('phase-text'),
  timerNum: $('timer-num'),
  ring: document.querySelector('.ring'),
  ringFg: $('ring-fg'),
  playBtn: $('play-btn'),
  countdown: $('countdown'),
  countdownNum: $('countdown-num'),
  players: $('players'),
  result: $('result'),
};

const initial = (name) => [...(name ?? '?')][0];

// ---------- 족보표 ----------
/** highlights: [{ rank, label, seat }] → 해당 족보 줄에 이름표 */
export function renderGuide(highlights = []) {
  el.guideList.replaceChildren(
    ...GUIDE.map((g, idx) => {
      const li = document.createElement('li');
      const mine = highlights.filter((h) => h.rank === g.rank);
      if (mine.length) li.classList.add('hit');
      if (mine.some((h) => h.me)) li.classList.add('me');
      const tags = mine.map((h) => `<span class="g-tag seat-${h.seat}">${h.label}</span>`).join('');
      const minis = g.cards
        .map((c) => `<span class="mini ${isRed(c) ? 'red' : 'black'}${c.key ? '' : ' dim'}">${rankHtml(c)}${suitSvg(c.suit)}</span>`)
        .join('');
      li.innerHTML = `<span class="g-no">${ROMAN[idx]}</span><span class="g-name">${g.name}<span class="g-tags">${tags}</span></span><span class="mini-row">${minis}</span>`;
      return li;
    }),
  );
}

// 핸드폰에서는 아래 패널로 열리고, 게임판은 패널 높이만큼 위로 스크롤할 수 있게 됨
export function setGuideOpen(open) {
  el.guide.classList.toggle('open', open);
  document.body.classList.toggle('guide-open', open);
  document.body.style.setProperty('--guide-h', `${el.guide.offsetHeight}px`);
  $('guide-btn').classList.toggle('active', open);
}

// ---------- 상태줄 / 타이머 ----------
let lastTickKey = '';
export function setStatus(step, label, secondsLeft = '–', ratio = 0) {
  // 외우기/선택 마지막 5초: 째깍 소리 + 짧은 진동
  if ((step === 'MEMORIZE' || step === 'SELECT') && typeof secondsLeft === 'number' && secondsLeft > 0 && secondsLeft <= 5) {
    const key = step + secondsLeft;
    if (key !== lastTickKey) {
      lastTickKey = key;
      play('tick');
      if (step === 'SELECT' && secondsLeft <= 3) buzz(12);
    }
  }
  el.phaseStep.textContent = step;
  el.phaseText.textContent = label;
  el.timerNum.textContent = secondsLeft;
  el.ringFg.style.strokeDashoffset = String(RING_LEN * (1 - Math.max(0, Math.min(1, ratio))));
  el.ring.classList.toggle('urgent', typeof secondsLeft === 'number' && secondsLeft <= 5);
}

export const setPhaseText = (t) => (el.phaseText.textContent = t);

// 3 → 2 → 1 큰 숫자. n 이 null 이면 숨김
let lastCount = null;
export function showCountdown(n) {
  if (n == null) {
    el.countdown.classList.add('hidden');
    lastCount = null;
    return;
  }
  el.countdown.classList.remove('hidden');
  if (n === lastCount) return;
  lastCount = n;
  el.countdownNum.textContent = n;
  el.countdownNum.classList.remove('pop');
  void el.countdownNum.offsetWidth; // 애니메이션 다시 시작
  el.countdownNum.classList.add('pop');
  play('count');
  buzz(10);
}

// ---------- 게임판 가운데 버튼 ----------
let playHandler = null;
el.playBtn.addEventListener('click', () => {
  if (!el.playBtn.classList.contains('disabled')) playHandler?.();
});
export function showPlayButton(label, { atBottom = false, disabled = false, onClick = null } = {}) {
  el.playBtn.textContent = label;
  el.playBtn.classList.remove('hidden');
  el.playBtn.classList.toggle('at-bottom', atBottom);
  el.playBtn.classList.toggle('disabled', disabled);
  el.playBtn.parentElement.classList.toggle('waiting', !atBottom);
  playHandler = onClick;
}
export function hidePlayButton() {
  el.playBtn.classList.add('hidden');
  el.playBtn.parentElement.classList.remove('waiting');
  playHandler = null;
}

// ---------- 공개 카드 ----------
export function drawCommunity(cards, { faceDown = false, reveal = false } = {}) {
  if (reveal) play('reveal');
  renderRow(el.community, cards ?? [BLANK_CARD, BLANK_CARD, BLANK_CARD], { faceDown: faceDown || !cards });
  el.community.classList.toggle('reveal', reveal);
}
export const flipCommunity = (faceDown) => flipAll(el.community, faceDown);

// ---------- 카드판 ----------
/**
 * @param {object} v
 *  cards: 16장 (없으면 뒷면 자리만), faceDown, owners: { 칸: [{seat, label, me}, ...] },
 *  (같은 칸을 여러 명이 고를 수 있어 칸마다 여러 명)
 *  clickable: (칸) => bool, onPick: (칸) => void, best: [칸, 칸]
 */
export function drawGrid({ cards, faceDown = true, owners = {}, clickable = () => false, onPick = null, best = [] }) {
  const list = cards ?? Array(GRID_SIZE).fill(BLANK_CARD);
  const nodes = list.map((card, i) => {
    const node = cardEl(card, { faceDown: faceDown || !cards });
    const os = owners[i] ?? []; // 내 것이 맨 앞
    if (os.length) {
      const first = os[0];
      node.classList.add(first.me ? 'mine' : 'taken', `seat-${first.seat}`);
      const tags = os
        .map((o) => `<span class="who-tag seat-${o.seat}${o.me ? ' me' : ''}">${o.label}</span>`)
        .join('');
      node.insertAdjacentHTML('beforeend', `<div class="who-tags">${tags}</div>`);
    }
    if (best.includes(i)) {
      node.classList.add('best');
      node.insertAdjacentHTML('beforeend', '<span class="best-tag">최고</span>');
    }
    if (clickable(i)) {
      node.classList.add('clickable');
      node.addEventListener('click', () => onPick?.(i));
    }
    return node;
  });
  el.grid.replaceChildren(...nodes);
}
export function flipGrid(faceDown) {
  play(faceDown ? 'flip' : 'go');
  if (!faceDown) setTimeout(() => play('flip'), 60);
  flipAll(el.grid, faceDown);
}

// ---------- 내 카드 ----------
export function drawMyPicks(cards, { faceDown = true, reveal = false, flipIn = false } = {}) {
  el.pickCount.textContent = `${cards.length} / ${PICKS_PER_PLAYER}`;
  const nodes = cards.map((c) => cardEl(c, { faceDown: faceDown || flipIn }));
  while (nodes.length < PICKS_PER_PLAYER) {
    const slot = document.createElement('div');
    slot.className = 'slot';
    slot.textContent = '+';
    nodes.push(slot);
  }
  el.myPicks.replaceChildren(...nodes);
  el.myPicks.classList.toggle('reveal', reveal);
  if (flipIn) setTimeout(() => flipAll(el.myPicks, false), 60);
}

// ---------- 오른쪽 플레이어 칸 ----------
/** list: [{ id, nickname, seat, wins, me, host, picks(0~2), online, place }] */
export function drawPlayers(list, { showPicks = false } = {}) {
  el.players.replaceChildren(
    ...list.map((p) => {
      const d = document.createElement('div');
      d.className = `pl seat-${p.seat}${p.me ? ' me' : ''}${p.online === false ? ' offline' : ''}${p.place === 1 ? ' first' : ''}`;
      const dots = showPicks
        ? `<span class="pl-picks">${Array.from({ length: PICKS_PER_PLAYER }, (_, i) => `<i class="${i < p.picks ? 'on' : ''}"></i>`).join('')}</span>`
        : '';
      d.innerHTML = `
        <span class="pl-av">${initial(p.nickname)}${p.host ? '<b class="pl-crown" title="방장">★</b>' : ''}</span>
        <span class="pl-name">${escapeHtml(p.me ? '나' : p.nickname)}</span>
        <span class="pl-wins">${p.wins}승</span>
        ${dots}
        ${p.place ? `<span class="pl-place">${p.place}등</span>` : ''}`;
      return d;
    }),
  );
  el.players.classList.toggle('hidden', list.length === 0);
}

export function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ---------- 결과 창 ----------
// 족보를 만드는 핵심 카드인지 (페어류는 같은 숫자 묶음, 하이카드는 가장 높은 1장)
function keyFlags(cards, ev) {
  const all = [HAND_RANK.STRAIGHT, HAND_RANK.FLUSH, HAND_RANK.FULL_HOUSE, HAND_RANK.STRAIGHT_FLUSH, HAND_RANK.ROYAL_FLUSH];
  if (all.includes(ev.rank)) return cards.map(() => true);
  if (ev.rank === HAND_RANK.HIGH_CARD) {
    const top = Math.max(...cards.map((c) => c.rank));
    let used = false;
    return cards.map((c) => (!used && c.rank === top ? (used = true) : false));
  }
  const count = (r) => cards.filter((c) => c.rank === r).length;
  return cards.map((c) => count(c.rank) >= 2);
}

/** 5장: 족보 만드는 카드 앞으로(트리플 → 페어 → 높은 숫자), 고른 카드에 이름표 */
export function renderHand(container, cards, ev, markCards = [], tagText = '선택', tagClass = '') {
  const flags = keyFlags(cards, ev);
  const cnt = (c) => cards.filter((x) => x.rank === c.rank).length;
  const wheel = ev.tiebreak[0] === 5 && (ev.rank === HAND_RANK.STRAIGHT || ev.rank === HAND_RANK.STRAIGHT_FLUSH);
  const val = (c) => (wheel && c.rank === 14 ? 1 : c.rank); // A-2-3-4-5 에선 A를 가장 낮게
  const sorted = cards
    .map((c, i) => ({ c, key: flags[i] }))
    .sort((a, b) => b.key - a.key || cnt(b.c) - cnt(a.c) || val(b.c) - val(a.c));
  renderRow(container, sorted.map((x) => x.c));
  [...container.children].forEach((node, i) => {
    node.classList.add(sorted[i].key ? 'key' : 'dim');
    if (markCards.some((m) => sameCard(m, sorted[i].c))) node.insertAdjacentHTML('beforeend', `<span class="pick-tag ${tagClass}">${tagText}</span>`);
  });
}

/**
 * v = {
 *   outcome: 'win'|'lose'|'draw', title, eyebrow,
 *   hands: [{ name, seat, me, place, desc, eval, cards, picked, auto }],  (순위순)
 *   best: { desc, eval, cards, picked, note },
 *   verdict: { headline, detail },
 *   nextLabel, onNext
 * }
 */
export function showResult(v) {
  const sheet = el.result.querySelector('.sheet');
  sheet.className = `sheet result ${v.outcome}${v.hands.length > 2 ? ' many' : ''}`;
  $('result-eyebrow').textContent = v.eyebrow;
  $('result-title').textContent = v.title;

  const list = $('result-hands');
  const many = v.hands.length > 2;
  list.replaceChildren(
    ...v.hands.map((h) => {
      const block = document.createElement('div');
      block.className = `hand-block seat-${h.seat}${h.place === 1 ? ' winner' : ''}${h.me ? ' me' : ''}`;
      block.innerHTML = `
        <div class="hand-who">
          <span class="place">${h.place}등</span>
          <span class="who">${escapeHtml(h.me ? '나' : h.name)}</span>
          <span class="hand-name">${h.desc}</span>
          ${h.auto && many ? '<span class="auto-badge">시간 초과</span>' : ''}
        </div>
        <div class="row hand"></div>
        ${h.auto && !many ? `<div class="auto-note">시간 초과 · 가장 약한 카드 ${h.auto}장이 자동으로 들어갔어요</div>` : ''}`;
      renderHand(block.querySelector('.hand'), h.cards, h.eval, h.picked, h.me ? '내 카드' : initial(h.name), `seat-${h.seat}`);
      return block;
    }),
  );

  // 최고 족보를 직접 만들었으면 같은 패를 또 보여주지 않고 한 줄 축하로
  const bestBlock = $('best-hand').closest('.hand-block');
  bestBlock.classList.toggle('made', !!v.best.made);
  $('best-hand-name').textContent = v.best.desc;
  renderHand($('best-hand'), v.best.cards, v.best.eval, v.best.picked);
  $('best-note').innerHTML = v.best.note;
  $('verdict-headline').textContent = v.verdict?.headline ?? '';
  $('verdict-detail').textContent = v.verdict?.detail ?? '';
  $('verdict').classList.toggle('hidden', !v.verdict);

  const next = $('next-btn');
  next.textContent = v.nextLabel;
  next.onclick = v.onNext;
  el.result.classList.remove('hidden');
  play(v.outcome);
  buzz(v.outcome === 'win' ? [30, 60, 30, 60, 80] : 40);
  if (v.outcome === 'win') confetti();
}

// 승리 연출: 금빛 종이가 위에서 흩날림
function confetti() {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const box = document.createElement('div');
  box.className = 'confetti';
  const colors = ['#f7e3a3', '#d4af37', '#fff4cc', '#b8902d', '#ffffff'];
  for (let i = 0; i < 46; i++) {
    const p = document.createElement('i');
    p.style.left = `${Math.random() * 100}%`;
    p.style.background = colors[i % colors.length];
    p.style.animationDelay = `${Math.random() * 0.5}s`;
    p.style.animationDuration = `${1.6 + Math.random() * 1.2}s`;
    p.style.setProperty('--drift', `${(Math.random() - 0.5) * 120}px`);
    p.style.setProperty('--spin', `${(Math.random() - 0.5) * 1080}deg`);
    box.appendChild(p);
  }
  document.body.appendChild(box);
  setTimeout(() => box.remove(), 3200);
}
export const hideResult = () => el.result.classList.add('hidden');

/** 결과 창의 '이번 판 최고' 안내 문구 */
export function bestNote(bestCells, myCells, owners, isMeBest) {
  const pos = (i) => `${Math.floor(i / GRID_COLS) + 1}행 ${(i % GRID_COLS) + 1}열`;
  if (isMeBest) return '<b>최고 족보를 완성했어요!</b>';
  return `골랐어야 할 카드 · ${bestCells
    .map((i) => {
      const others = (owners[i] ?? []).filter((o) => !o.me);
      const who = others.length ? ` (${others.map((o) => escapeHtml(o.name)).join(', ')}님도 고름)` : '';
      return `<b>${pos(i)}</b>${who}`;
    })
    .join(', ')}`;
}

// ---------- 화면 맞춤 ----------
const layoutEl = document.querySelector('.layout');
export function fitToScreen() {
  layoutEl.style.zoom = '';
  const app = $('app');
  app.style.setProperty('--spare', '0px');
  if (innerWidth < 820) {
    // 핸드폰: 카드판이 가로폭에 막혀 위아래로 빈 공간이 남으면, 그 공간을 요소 사이 간격으로 나눔
    const area = document.querySelector('.grid-area').getBoundingClientRect().height;
    const rim = document.querySelector('.grid-rim').getBoundingClientRect().height;
    const gaps = app.children.length - 1 + (document.querySelector('.main-col').children.length - 1);
    if (area - rim > 2) app.style.setProperty('--spare', `${(area - rim) / gaps}px`);
    return;
  }
  const h = layoutEl.scrollHeight;
  if (h > innerHeight) layoutEl.style.zoom = String(Math.max(0.6, (innerHeight - 4) / h));
}

// ---------- 처음 한 번: 장식 + 공통 버튼 ----------
export function initBoard() {
  document.querySelectorAll('.emblem').forEach((e) => (e.innerHTML = suitSvg('S')));
  document.querySelector('.chip-icon').innerHTML = '<i></i><i></i><i></i>';
  document.querySelectorAll('.sheet-crest').forEach((c) => {
    c.innerHTML = ['S', 'H', 'D', 'C'].map((x) => `<span class="${isRed({ suit: x }) ? 'red' : ''}">${suitSvg(x)}</span>`).join('');
  });
  $('guide-btn').addEventListener('click', () => setGuideOpen(!el.guide.classList.contains('open')));
  $('guide-close').addEventListener('click', () => setGuideOpen(false));
  $('result-guide-btn').addEventListener('click', () => {
    hideResult();
    setGuideOpen(true);
  });
  $('start-btn').addEventListener('click', () => $('intro').classList.add('hidden'));
  $('help-btn').addEventListener('click', () => $('intro').classList.remove('hidden'));
  $('home-help')?.addEventListener('click', () => $('intro').classList.remove('hidden'));
  const soundBtn = $('sound-btn');
  const drawSound = () => {
    soundBtn.textContent = isMuted() ? '🔇' : '🔊';
    soundBtn.setAttribute('aria-label', isMuted() ? '소리 켜기' : '소리 끄기');
  };
  soundBtn.addEventListener('click', () => {
    setMuted(!isMuted());
    drawSound();
    play('pick');
  });
  drawSound();
  addEventListener('resize', fitToScreen);
  document.fonts?.ready.then(fitToScreen);
  renderGuide();
}

/** 대기 화면용: 카드판·공개 카드 모두 뒷면 */
export function drawIdleBoard() {
  drawCommunity(null);
  drawGrid({ cards: null });
  drawMyPicks([]);
  showCountdown(null);
}

