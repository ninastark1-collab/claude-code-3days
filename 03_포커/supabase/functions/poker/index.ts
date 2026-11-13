// 기억력 포커 서버: 방 만들기/참가/시작/카드 고르기/단계 진행을 모두 여기서 처리.
// 폰은 DB 를 읽기만 하고(실시간 구독), 쓰기는 이 함수만 (service_role).
// game/ 폴더는 src/game 을 scripts/sync-game.mjs 로 복사한 것 — 화면과 똑같은 규칙 사용.
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { dealDramaticRound } from './game/dramaDeal.js';
import { finishRound, MAX_PLAYERS } from './game/match.js';

const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false },
});

const COUNTDOWN_SEC = 3;
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 헷갈리는 0 O 1 I 제외

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

class GameError extends Error {}
const fail = (code: string) => { throw new GameError(code); };
const nowIso = (plusSec = 0) => new Date(Date.now() + plusSec * 1000).toISOString();

async function sha256(text: string) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function cleanNickname(n: unknown) {
  const s = String(n ?? '').trim().replace(/\s+/g, ' ').slice(0, 12);
  if (!s) fail('nickname_required');
  return s;
}

async function getRoomById(id: string) {
  const { data } = await db.from('poker_rooms').select('*').eq('id', id).maybeSingle();
  if (!data) fail('no_room');
  return data;
}

async function getPlayers(roomId: string) {
  const { data } = await db.from('poker_players').select('id, nickname, seat, wins').eq('room_id', roomId).order('seat');
  return data ?? [];
}

// player_id + secret 확인 → 플레이어와 방
async function auth(body: any) {
  const { player_id, secret } = body;
  if (!player_id || !secret) fail('unauthorized');
  const { data: key } = await db.from('poker_player_keys').select('secret_hash').eq('player_id', player_id).maybeSingle();
  if (!key || key.secret_hash !== (await sha256(secret))) fail('unauthorized');
  const { data: player } = await db.from('poker_players').select('*').eq('id', player_id).maybeSingle();
  if (!player) fail('unauthorized');
  const room = await getRoomById(player.room_id);
  return { player, room };
}

async function addPlayer(roomId: string, nickname: string, seat: number) {
  const secret = crypto.randomUUID() + crypto.randomUUID();
  const { data: player, error } = await db
    .from('poker_players')
    .insert({ room_id: roomId, nickname, seat })
    .select()
    .single();
  if (error) fail(error.code === '23505' ? 'seat_conflict' : 'db_error');
  await db.from('poker_player_keys').insert({ player_id: player.id, secret_hash: await sha256(secret) });
  return { player, secret };
}

const clampSec = (v: unknown, def: number) => {
  const n = Number(v);
  return Number.isFinite(n) && n >= 1 && n <= 120 ? Math.round(n) : def;
};

// ---------- 액션 ----------
const actions: Record<string, (body: any) => Promise<any>> = {
  async create_room(body) {
    const nickname = cleanNickname(body.nickname);
    let room = null;
    for (let tries = 0; tries < 8 && !room; tries++) {
      const code = Array.from({ length: 4 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('');
      const { data } = await db
        .from('poker_rooms')
        .insert({ code, memorize_sec: clampSec(body.memorize_sec, 30), pick_sec: clampSec(body.pick_sec, 15) })
        .select()
        .single();
      room = data;
    }
    if (!room) fail('db_error');
    const { player, secret } = await addPlayer(room.id, nickname, 0);
    await db.from('poker_rooms').update({ host_id: player.id }).eq('id', room.id);
    return { room_id: room.id, code: room.code, player_id: player.id, secret };
  },

  async join_room(body) {
    const code = String(body.code ?? '').trim().toUpperCase();
    const { data: room } = await db.from('poker_rooms').select('*').eq('code', code).maybeSingle();
    if (!room) fail('no_room');

    // 이미 이 방 사람이면 그대로 복귀 (새로고침 등)
    if (body.player_id && body.secret) {
      try {
        const me = await auth(body);
        if (me.room.id === room.id) return { room_id: room.id, code: room.code, player_id: me.player.id, secret: body.secret, rejoined: true };
      } catch (_) { /* 새로 참가 */ }
    }
    if (!['LOBBY', 'SHOWDOWN'].includes(room.phase)) fail('in_progress');
    const nickname = cleanNickname(body.nickname);
    const players = await getPlayers(room.id);
    if (players.length >= MAX_PLAYERS) fail('full');
    const taken = new Set(players.map((p: any) => p.seat));
    const seat = [0, 1, 2, 3].find((s) => !taken.has(s))!;
    const { player, secret } = await addPlayer(room.id, nickname, seat);
    return { room_id: room.id, code: room.code, player_id: player.id, secret };
  },

  async leave(body) {
    const { player, room } = await auth(body);
    await db.from('poker_players').delete().eq('id', player.id);
    const rest = await getPlayers(room.id);
    if (rest.length === 0) {
      await db.from('poker_rooms').delete().eq('id', room.id);
    } else if (room.host_id === player.id) {
      await db.from('poker_rooms').update({ host_id: rest[0].id, updated_at: nowIso() }).eq('id', room.id);
    }
    return { left: true };
  },

  async start_round(body) {
    const { player, room } = await auth(body);
    if (room.host_id !== player.id) fail('not_host');
    if (!['LOBBY', 'SHOWDOWN'].includes(room.phase)) fail('in_progress');
    const players = await getPlayers(room.id);
    if (players.length < 2) fail('need_players');

    const { community, grid } = dealDramaticRound();
    const round_no = room.round_no + 1;
    await db.from('poker_secrets').upsert({ room_id: room.id, round_no, grid, community });
    const { data } = await db
      .from('poker_rooms')
      .update({
        phase: 'COUNTDOWN', phase_ends_at: nowIso(COUNTDOWN_SEC), round_no,
        grid: null, community: null, picks: {}, pick_seq: 0, result: null, updated_at: nowIso(),
      })
      .eq('id', room.id)
      .in('phase', ['LOBBY', 'SHOWDOWN'])
      .select('id');
    if (!data?.length) fail('in_progress');
    return { started: true };
  },

  async pick(body) {
    const { player, room } = await auth(body);
    const { data, error } = await db.rpc('poker_pick', { p_room: room.id, p_player: player.id, p_cell: Number(body.cell) });
    if (error) fail('db_error');
    if (!data.ok) fail(data.error);
    return { picks: data.picks };
  },

  // 타이머가 끝나면 아무 폰이나 호출. 서버가 시각을 확인하고, 조건부 업데이트로 딱 한 번만 진행
  async advance(body) {
    const room = await getRoomById(body.room_id);
    if (!room.phase_ends_at) return { advanced: false };
    // 선택 단계는 마감 후 0.3초 여유(마감 직전 고른 카드가 반영되도록), 나머지는 0.15초 일찍 허용
    const slackMs = room.phase === 'PICK' ? -300 : 150;
    if (Date.now() < Date.parse(room.phase_ends_at) - slackMs) return { advanced: false, wait: true };

    const guard = (q: any) => q.eq('id', room.id).eq('phase', room.phase).eq('round_no', room.round_no).select('id');

    if (room.phase === 'COUNTDOWN' || room.phase === 'MEMORIZE') {
      const { data: sec } = await db.from('poker_secrets').select('*').eq('room_id', room.id).eq('round_no', room.round_no).single();
      const next = room.phase === 'COUNTDOWN'
        ? { phase: 'MEMORIZE', grid: sec.grid, phase_ends_at: nowIso(room.memorize_sec) }
        : { phase: 'PICK', community: sec.community, phase_ends_at: nowIso(room.pick_sec) };
      const { data } = await guard(db.from('poker_rooms').update({ ...next, updated_at: nowIso() }));
      return { advanced: !!data?.length };
    }

    if (room.phase === 'PICK') {
      const players = await getPlayers(room.id);
      const r = finishRound({ community: room.community, grid: room.grid, picks: room.picks, players });
      const info = Object.fromEntries(players.map((p: any) => [p.id, p]));
      const result = {
        ...r,
        ranking: r.ranking.map((x: any) => ({ ...x, nickname: info[x.id]?.nickname, seat: info[x.id]?.seat })),
      };
      const { data } = await guard(
        db.from('poker_rooms').update({ phase: 'SHOWDOWN', phase_ends_at: null, picks: r.picks, result, updated_at: nowIso() }),
      );
      if (data?.length && !r.draw) {
        const winner = info[r.winners[0]];
        if (winner) await db.from('poker_players').update({ wins: winner.wins + 1 }).eq('id', winner.id);
      }
      return { advanced: !!data?.length };
    }
    return { advanced: false };
  },
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  let status = 200;
  let payload: any;
  try {
    const body = await req.json();
    const fn = actions[body?.action];
    if (!fn) fail('unknown_action');
    payload = { ok: true, ...(await fn(body)) };
  } catch (e) {
    status = e instanceof GameError ? 400 : 500;
    payload = { ok: false, error: e instanceof GameError ? e.message : 'server_error' };
    if (!(e instanceof GameError)) console.error(e);
  }
  payload.server_now = Date.now(); // 폰 시계 보정용
  return new Response(JSON.stringify(payload), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
});
