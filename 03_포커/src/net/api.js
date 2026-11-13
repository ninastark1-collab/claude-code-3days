// 서버(Supabase) 연결: Edge Function 호출 + 실시간 구독용 클라이언트 + 서버 시계 보정
import { createClient } from '@supabase/supabase-js';

const URL = import.meta.env.VITE_SUPABASE_URL;
const KEY = import.meta.env.VITE_SUPABASE_KEY;

export const supabase = createClient(URL, KEY, { auth: { persistSession: false } });

let offset = 0; // 서버 시각 - 내 폰 시각
export const serverNow = () => Date.now() + offset;

export const ERROR_KO = {
  nickname_required: '닉네임을 입력해 주세요',
  no_room: '그런 방이 없어요. 코드를 다시 확인해 주세요',
  full: '방이 꽉 찼어요 (최대 4명)',
  in_progress: '지금 게임이 진행 중이에요. 이번 판이 끝나면 들어올 수 있어요',
  not_host: '방장만 시작할 수 있어요',
  need_players: '2명 이상 모여야 시작할 수 있어요',
  taken: '다른 사람이 먼저 가져갔어요',
  not_pick_phase: '선택 시간이 끝났어요',
  unauthorized: '방 정보가 만료됐어요. 다시 참가해 주세요',
  network: '인터넷 연결을 확인해 주세요',
};
export const errorText = (e) => ERROR_KO[e?.code] ?? '문제가 생겼어요. 잠시 후 다시 시도해 주세요';

export async function call(action, body = {}) {
  const t0 = Date.now();
  let res;
  try {
    res = await fetch(`${URL}/functions/v1/poker`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: KEY, Authorization: `Bearer ${KEY}` },
      body: JSON.stringify({ action, ...body }),
    });
  } catch {
    throw Object.assign(new Error('network'), { code: 'network' });
  }
  const t1 = Date.now();
  const json = await res.json().catch(() => ({ ok: false, error: 'server_error' }));
  // 왕복 시간의 가운데를 서버 시각으로 보고 차이를 보정
  if (json.server_now) offset = json.server_now - (t0 + t1) / 2;
  if (!json.ok) throw Object.assign(new Error(json.error), { code: json.error });
  return json;
}
