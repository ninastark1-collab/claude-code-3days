// 온라인 대전: 서버(DB)의 방 상태를 실시간으로 받아 화면에 그림.
// 게임 진행(카드 배분, 단계 전환, 판정)은 모두 서버가 하고, 이 폰은 '고르기'와 '시간 끝났어요(advance)'만 보냄.
import { GRID_SIZE } from '../game/deck.js';
import { picksByPlayer, applyPick, PICKS_PER_PLAYER, MAX_PLAYERS } from '../game/match.js';
import { play } from '../ui/sound.js';
import * as B from '../ui/board.js';
import { supabase, call, serverNow, errorText } from '../net/api.js';
import { clearSession } from '../net/session.js';
import { ownersFrom, guideHighlights, resultView, initial } from './common.js';

const $ = (id) => document.getElementById(id);
const FLIP_MS = 650;

let s = null; // 현재 방 상태

export async function enterOnline(session, { onExit, toast }) {
  leaveOnline();
  s = {
    session,
    meId: session.player_id,
    room: null,
    players: [],
    online: new Set(),
    channel: null,
    timers: [],
    lastAdvance: 0,
    shown: { phase: null, round: null }, // 화면에 마지막으로 그린 단계
    flipUntil: 0,
    resultShownRound: null,
    onExit,
    toast,
  };
  await Promise.all([loadRoom(), loadPlayers()]);
  if (!s) return;
  if (!s.room || !s.players.some((p) => p.id === s.meId)) return exitRoom('방에 다시 들어가 주세요');
  subscribe();
  s.timers.push(setInterval(tick, 100));
  s.timers.push(setInterval(() => { loadRoom(); loadPlayers(); }, 5000)); // 실시간 연결이 끊겼을 때 대비
  render();
}

export function leaveOnline() {
  if (!s) return;
  s.timers.forEach((id) => clearInterval(id));
  if (s.channel) supabase.removeChannel(s.channel);
  B.hideResult();
  B.showCountdown(null);
  $('lobby').classList.add('hidden');
  s = null;
}

async function exitRoom(message) {
  const onExit = s?.onExit;
  clearSession();
  leaveOnline();
  onExit?.(message);
}

export async function leaveRoom() {
  if (!s) return;
  const { player_id, secret } = s.session;
  try { await call('leave', { player_id, secret }); } catch {}
  exitRoom();
}

// ---------- 데이터 ----------
async function loadRoom() {
  if (!s) return;
  const { data } = await supabase.from('poker_rooms').select('*').eq('id', s.session.room_id).maybeSingle();
  if (!s) return;
  if (!data) return exitRoom('방이 없어졌어요');
  onRoom(data);
}

async function loadPlayers() {
  if (!s) return;
  const { data } = await supabase.from('poker_players').select('id, nickname, seat, wins').eq('room_id', s.session.room_id).order('seat');
  if (!s || !data) return;
  s.players = data;
  if (s.room && !data.some((p) => p.id === s.meId)) return exitRoom('방에서 나가졌어요');
  drawPlayers();
  drawLobby();
}

function onRoom(room) {
  if (!s) return;
  const prev = s.room;
  // 오래된 업데이트는 무시
  if (prev && Date.parse(room.updated_at) < Date.parse(prev.updated_at)) return;
  s.room = room;
  render();
}

function subscribe() {
  const id = s.session.room_id;
  const ch = supabase.channel(`room-${id}`, { config: { presence: { key: s.meId } } });
  ch.on('postgres_changes', { event: '*', schema: 'public', table: 'poker_rooms', filter: `id=eq.${id}` }, (p) => {
    if (p.eventType === 'DELETE') return exitRoom('방이 없어졌어요');
    onRoom(p.new);
  })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'poker_players', filter: `room_id=eq.${id}` }, loadPlayers)
    .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'poker_players' }, loadPlayers)
    .on('presence', { event: 'sync' }, () => {
      if (!s) return;
      s.online = new Set(Object.keys(ch.presenceState()));
      drawPlayers();
      drawLobby();
    })
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        ch.track({ at: Date.now() });
        loadRoom();
        loadPlayers();
      }
    });
  s.channel = ch;
}

// ---------- 공통 계산 ----------
const info = () => Object.fromEntries(s.players.map((p) => [p.id, p]));
const isHost = () => s.room?.host_id === s.meId;
const myCells = () => picksByPlayer(s.room?.picks ?? {})[s.meId] ?? [];
const pickLabel = () => (myCells().length < PICKS_PER_PLAYER ? '2장을 고르세요' : '선택 완료 · 변경 가능');
const phaseTotal = (phase) => ({ COUNTDOWN: 3, MEMORIZE: s.room.memorize_sec, PICK: s.room.pick_sec }[phase] ?? 1);

function drawPlayers() {
  if (!s) return;
  const counts = picksByPlayer(s.room?.picks ?? {});
  const result = s.room?.phase === 'SHOWDOWN' ? s.room.result : null;
  B.drawPlayers(
    s.players.map((p) => ({
      ...p,
      me: p.id === s.meId,
      host: p.id === s.room?.host_id,
      online: s.online.size ? s.online.has(p.id) : true,
      picks: (counts[p.id] ?? []).length,
      place: result?.ranking.find((r) => r.id === p.id)?.place,
    })),
    { showPicks: s.room?.phase === 'PICK' },
  );
}

// ---------- 대기실 ----------
function drawLobby() {
  if (!s?.room) return;
  const lobby = $('lobby');
  const show = s.room.phase === 'LOBBY';
  lobby.classList.toggle('hidden', !show);
  if (!show) return;
  $('room-code').textContent = s.room.code;
  $('lobby-count').textContent = `${s.players.length} / ${MAX_PLAYERS}`;
  $('lobby-list').replaceChildren(
    ...s.players.map((p) => {
      const li = document.createElement('li');
      li.className = `seat-${p.seat}${p.id === s.meId ? ' me' : ''}${s.online.size && !s.online.has(p.id) ? ' offline' : ''}`;
      li.innerHTML = `<span class="pl-av">${initial(p.nickname)}</span><span class="lb-name">${B.escapeHtml(p.nickname)}${p.id === s.meId ? ' (나)' : ''}</span>${p.id === s.room.host_id ? '<span class="lb-host">방장</span>' : ''}`;
      return li;
    }),
    ...Array.from({ length: MAX_PLAYERS - s.players.length }, () => {
      const li = document.createElement('li');
      li.className = 'empty';
      li.innerHTML = '<span class="pl-av">+</span><span class="lb-name">빈 자리</span>';
      return li;
    }),
  );
  const start = $('lobby-start');
  const enough = s.players.length >= 2;
  start.classList.toggle('hidden', !isHost());
  start.disabled = !enough;
  $('lobby-wait').textContent = isHost()
    ? enough ? '' : '친구가 1명 이상 들어오면 시작할 수 있어요'
    : '방장이 게임을 시작하기를 기다리는 중…';
}

export async function startGame() {
  if (!s) return;
  $('lobby-error').textContent = '';
  try {
    await call('start_round', { player_id: s.session.player_id, secret: s.session.secret });
    loadRoom();
  } catch (e) {
    $('lobby-error').textContent = errorText(e);
    s.toast(errorText(e));
  }
}

// ---------- 카드판 ----------
function drawPickGrid() {
  const r = s.room;
  B.drawGrid({
    cards: r.grid,
    faceDown: true,
    owners: ownersFrom(r.picks, s.meId, info()),
    clickable: (i) => !r.picks[i] || r.picks[i].p === s.meId,
    onPick,
  });
  B.drawMyPicks(myCells().map((i) => r.grid[i]));
}

// 누르는 즉시 화면에 반영(낙관적 업데이트) → 서버 결과로 맞춤. 남이 먼저 가져갔으면 되돌림
async function onPick(cell) {
  const r = s.room;
  const local = applyPick(r.picks, r.pick_seq ?? 0, s.meId, cell);
  if (!local.ok) return;
  const picked = local.picks[cell]?.p === s.meId;
  play(picked ? 'pick' : 'unpick');
  try { navigator.vibrate?.(15); } catch {}
  s.room = { ...r, picks: local.picks, pick_seq: local.seq };
  drawPickGrid();
  drawPlayers();
  B.setPhaseText(pickLabel());
  try {
    const res = await call('pick', { player_id: s.session.player_id, secret: s.session.secret, cell });
    if (s?.room?.phase === 'PICK') {
      s.room = { ...s.room, picks: res.picks };
      drawPickGrid();
      drawPlayers();
      B.setPhaseText(pickLabel());
    }
  } catch (e) {
    if (!s) return;
    play('taken');
    s.toast(errorText(e));
    loadRoom(); // 서버 상태로 되돌림
  }
}

// ---------- 화면 그리기 (단계가 바뀔 때 애니메이션) ----------
function render() {
  if (!s?.room) return;
  const r = s.room;
  const prev = s.shown;
  const changed = prev.phase !== r.phase || prev.round !== r.round_no;
  const continuous = prev.round === r.round_no; // 같은 판 안에서 다음 단계로 넘어온 것 (애니메이션 가능)
  s.shown = { phase: r.phase, round: r.round_no };

  drawPlayers();
  drawLobby();

  if (!changed) {
    if (r.phase === 'PICK' && Date.now() > s.flipUntil) drawPickGrid();
    if (r.phase === 'SHOWDOWN') drawWaitingButton();
    return;
  }

  switch (r.phase) {
    case 'LOBBY':
      B.hideResult();
      B.drawIdleBoard();
      B.hidePlayButton();
      B.setStatus('READY', '참가자를 기다리는 중');
      break;

    case 'COUNTDOWN':
      B.hideResult();
      B.hidePlayButton();
      B.renderGuide();
      B.drawCommunity(null);
      B.drawGrid({ cards: null });
      B.drawMyPicks([]);
      break;

    case 'MEMORIZE':
      B.hideResult();
      B.hidePlayButton();
      B.showCountdown(null);
      B.drawCommunity(null);
      B.drawMyPicks([]);
      if (continuous && prev.phase === 'COUNTDOWN') {
        B.drawGrid({ cards: r.grid, faceDown: true });
        setTimeout(() => B.flipGrid(false), 40); // 뒷면 → 앞면으로 뒤집으며 공개
      } else {
        B.drawGrid({ cards: r.grid, faceDown: false });
      }
      break;

    case 'PICK':
      B.hideResult();
      B.hidePlayButton();
      if (continuous && prev.phase === 'MEMORIZE') {
        B.flipGrid(true);
        B.drawCommunity(r.community, { faceDown: true });
        setTimeout(() => B.flipCommunity(false), 40);
        s.flipUntil = Date.now() + FLIP_MS;
        setTimeout(() => s?.room?.phase === 'PICK' && drawPickGrid(), FLIP_MS);
      } else {
        B.drawCommunity(r.community);
        drawPickGrid();
      }
      break;

    case 'SHOWDOWN':
      showShowdown(continuous && prev.phase === 'PICK');
      break;
  }
  B.fitToScreen();
}

function showShowdown(animate) {
  const r = s.room;
  const result = r.result;
  if (!result) return;
  const owners = ownersFrom(result.picks, s.meId, Object.fromEntries(result.ranking.map((x) => [x.id, x])));
  const me = result.ranking.find((x) => x.id === s.meId);
  B.showCountdown(null);
  B.setStatus('SHOWDOWN', me ? '내 패 = 공개 3장 + 내 카드 2장' : '결과 공개');
  B.drawGrid({ cards: r.grid, faceDown: false, owners, best: result.best.cells });
  B.drawCommunity(r.community, { reveal: true });
  B.drawMyPicks((me?.cells ?? []).map((i) => r.grid[i]), { flipIn: animate, faceDown: false, reveal: true });
  B.renderGuide(guideHighlights(result, s.meId));
  B.hidePlayButton();

  const open = () => {
    if (!s || s.room.phase !== 'SHOWDOWN' || s.room.round_no !== r.round_no) return;
    B.showResult(resultView({ result, meId: s.meId, owners, nextLabel: '확인', onNext: B.hideResult }));
    drawWaitingButton();
  };
  if (animate) setTimeout(open, B.REVEAL_MS);
  else open();
}

// 결과 후: 방장은 '게임 시작'(3초 후 시작), 나머지는 기다림 표시
function drawWaitingButton() {
  if (!s || s.room.phase !== 'SHOWDOWN') return;
  if (isHost()) {
    const enough = s.players.length >= 2;
    B.showPlayButton(enough ? '게임 시작' : '참가자를 기다리는 중', { atBottom: true, disabled: !enough, onClick: startGame });
  } else {
    B.showPlayButton('방장이 시작하기를 기다리는 중', { atBottom: true, disabled: true });
  }
}

// ---------- 타이머 (서버 시각 기준) ----------
function tick() {
  if (!s?.room) return;
  const r = s.room;
  if (!['COUNTDOWN', 'MEMORIZE', 'PICK'].includes(r.phase) || !r.phase_ends_at) return;
  const left = Date.parse(r.phase_ends_at) - serverNow();
  const secs = Math.max(0, Math.ceil(left / 1000));
  const ratio = Math.max(0, left) / (phaseTotal(r.phase) * 1000);
  if (r.phase === 'COUNTDOWN') {
    B.showCountdown(secs > 0 ? secs : null);
    B.setStatus('GET READY', '곧 시작합니다', secs, ratio);
  } else if (r.phase === 'MEMORIZE') {
    B.setStatus('MEMORIZE', `${GRID_SIZE}장을 외우세요`, secs, ratio);
  } else {
    B.setStatus('SELECT', pickLabel(), secs, ratio);
  }
  // 시간이 끝나면 서버에 다음 단계로 넘겨 달라고 요청 (여러 폰이 보내도 서버가 한 번만 처리)
  // 선택 단계는 마감 후 0.4초 기다렸다가(마지막 클릭 반영), 나머지는 0.1초 일찍 요청해서 전환 지연을 줄임
  const trigger = r.phase === 'PICK' ? -400 : 100;
  if (left <= trigger && Date.now() - s.lastAdvance > 700) {
    s.lastAdvance = Date.now();
    call('advance', { room_id: r.id }).then(loadRoom).catch(() => {});
  }
}
