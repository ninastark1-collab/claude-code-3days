// 시작점: 첫 화면(닉네임·방 만들기·참가·혼자 연습) → 온라인 대전 또는 연습 모드
import { GRID_SIZE } from './game/deck.js';
import * as B from './ui/board.js';
import { enterPractice, leavePractice, practiceTimes } from './modes/practice.js';
import { enterOnline, leaveOnline, leaveRoom, startGame } from './modes/online.js';
import { call, errorText } from './net/api.js';
import { getNickname, setNickname, getSession, setSession, clearSession } from './net/session.js';
import { initInstall } from './install.js';

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
let mode = null; // 'practice' | 'online' | null

// ---------- 알림 ----------
let toastTimer;
function toast(text) {
  const t = $('toast');
  t.textContent = text;
  t.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.add('hidden'), 2200);
}

// ---------- 게임 중에는 화면이 꺼지지 않게 ----------
let wakeLock = null;
async function keepAwake(on) {
  try {
    if (on && !wakeLock && 'wakeLock' in navigator && document.visibilityState === 'visible') {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => (wakeLock = null));
    } else if (!on && wakeLock) {
      await wakeLock.release();
      wakeLock = null;
    }
  } catch {}
}
document.addEventListener('visibilitychange', () => mode && keepAwake(true));

// ---------- 화면 전환 ----------
function showHome(message = '') {
  if (mode === 'practice') leavePractice();
  if (mode === 'online') leaveOnline();
  mode = null;
  keepAwake(false);
  setRoomInUrl(null);
  $('home').classList.remove('hidden');
  $('lobby').classList.add('hidden');
  $('home-error').textContent = message;
  B.drawIdleBoard();
  B.drawPlayers([]);
  B.hidePlayButton();
  B.setStatus('READY', '방을 만들거나 참가하세요');
  document.body.classList.remove('online', 'practice');
}

function setRoomInUrl(code) {
  const u = new URL(location.href);
  if (code) u.searchParams.set('room', code);
  else u.searchParams.delete('room');
  history.replaceState(null, '', u);
}

async function goOnline(session) {
  setSession(session);
  setRoomInUrl(session.code);
  $('home').classList.add('hidden');
  mode = 'online';
  keepAwake(true);
  document.body.classList.add('online');
  document.body.classList.remove('practice');
  await enterOnline(session, { onExit: (msg) => { mode = null; showHome(msg ?? ''); }, toast });
}

function goPractice() {
  $('home').classList.add('hidden');
  mode = 'practice';
  keepAwake(true);
  document.body.classList.add('practice');
  document.body.classList.remove('online');
  enterPractice($('nickname').value.trim() || getNickname());
}

// ---------- 첫 화면 ----------
function readNickname() {
  const n = $('nickname').value.trim();
  if (!n) {
    $('home-error').textContent = '닉네임을 입력해 주세요';
    $('nickname').focus();
    return null;
  }
  setNickname(n);
  return n;
}

function busy(btn, on) {
  btn.disabled = on;
  btn.classList.toggle('loading', on);
}

$('create-btn').addEventListener('click', async () => {
  const nickname = readNickname();
  if (!nickname) return;
  busy($('create-btn'), true);
  try {
    // 테스트용: 주소에 ?m=5&p=5 가 있으면 방 시간도 짧게
    const extra = {};
    if (params.get('m') || params.get('t')) extra.memorize_sec = Number(params.get('m') || params.get('t'));
    if (params.get('p') || params.get('t')) extra.pick_sec = Number(params.get('p') || params.get('t'));
    const r = await call('create_room', { nickname, ...extra });
    await goOnline({ code: r.code, room_id: r.room_id, player_id: r.player_id, secret: r.secret });
  } catch (e) {
    $('home-error').textContent = errorText(e);
  } finally {
    busy($('create-btn'), false);
  }
});

async function joinByCode(code, { silent = false } = {}) {
  code = code.trim().toUpperCase();
  if (code.length !== 4) {
    $('home-error').textContent = '방 코드 4자리를 입력해 주세요';
    return;
  }
  const saved = getSession();
  const creds = saved?.code === code ? { player_id: saved.player_id, secret: saved.secret } : {};
  const nickname = creds.player_id ? getNickname() || '?' : readNickname();
  if (!nickname) return;
  busy($('join-btn'), true);
  try {
    const r = await call('join_room', { code, nickname, ...creds });
    await goOnline({ code: r.code, room_id: r.room_id, player_id: r.player_id, secret: r.secret });
  } catch (e) {
    if (e.code === 'unauthorized' || e.code === 'no_room') clearSession();
    if (!silent || e.code !== 'unauthorized') $('home-error').textContent = errorText(e);
  } finally {
    busy($('join-btn'), false);
  }
}

$('join-btn').addEventListener('click', () => joinByCode($('join-code').value));
$('join-code').addEventListener('input', (e) => (e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '')));
$('join-code').addEventListener('keydown', (e) => e.key === 'Enter' && joinByCode(e.target.value));
$('nickname').addEventListener('keydown', (e) => e.key === 'Enter' && ($('join-code').value.length === 4 ? joinByCode($('join-code').value) : $('create-btn').click()));
$('practice-btn').addEventListener('click', goPractice);

// ---------- 대기실 ----------
$('lobby-start').addEventListener('click', startGame);
$('lobby-leave').addEventListener('click', () => leaveRoom());
$('share-btn').addEventListener('click', async () => {
  const code = getSession()?.code;
  const url = `${location.origin}${location.pathname}?room=${code}`;
  const text = `기억력 포커 하자! 방 코드 ${code}`;
  try {
    if (navigator.share) {
      await navigator.share({ title: '기억력 포커', text, url });
      return;
    }
    await navigator.clipboard.writeText(`${text}\n${url}`);
    $('share-msg').textContent = '초대 링크를 복사했어요. 메신저에 붙여넣어 보내세요';
  } catch {
    $('share-msg').textContent = url;
  }
});

// ---------- 나가기 ----------
$('exit-btn').addEventListener('click', () => {
  if (mode === 'online') {
    if (confirm('방에서 나갈까요?')) leaveRoom();
  } else if (mode === 'practice') {
    showHome();
  }
});

// ---------- 시작 ----------
B.initBoard();
initInstall({ toast });
$('step1').textContent = `카드 ${GRID_SIZE}장을 ${practiceTimes.MEMORIZE_SECONDS}초 동안 외우세요`;
$('step3').textContent = `${practiceTimes.PICK_SECONDS}초 동안 2장을 고르세요. 못 고르면 가장 약한 카드가 들어가요`;
$('nickname').value = getNickname();
showHome();
B.fitToScreen();

// 초대 링크(?room=ABCD)로 들어왔거나, 새로고침했을 때
const roomFromUrl = (params.get('room') || '').toUpperCase();
if (roomFromUrl) {
  $('join-code').value = roomFromUrl;
  const saved = getSession();
  if (saved?.code === roomFromUrl) joinByCode(roomFromUrl, { silent: true });
  else if (!getNickname()) $('nickname').focus();
}
