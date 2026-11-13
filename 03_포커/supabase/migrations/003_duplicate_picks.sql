-- 카드 16장(4×4) + 같은 카드 중복 선택 허용
-- picks 모양이 바뀜:
--   이전: { "칸번호": {"p": player_id, "t": 순서} }            (한 칸에 한 명)
--   이후: { "player_id:칸번호": {"p": player_id, "c": 칸번호, "t": 순서} }  (한 칸에 여러 명 가능)

-- 진행 중인 판은 예전 모양의 picks 를 가지고 있으므로 비움 (배포 직후 한 판만 영향)
update public.poker_rooms
   set picks = '{}'::jsonb, pick_seq = 0
 where phase in ('COUNTDOWN', 'MEMORIZE', 'PICK');

-- 카드 고르기 (동시 클릭을 행 잠금으로 직렬화)
--  - 내가 고른 카드를 다시 고르면 취소
--  - 이미 2장이면 가장 먼저 고른 카드를 빼고 새 카드로 교체
--  - 다른 사람이 고른 칸도 고를 수 있음 (실패 사유 'taken' 은 더 이상 없음)
create or replace function public.poker_pick(p_room uuid, p_player uuid, p_cell int)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r        public.poker_rooms%rowtype;
  key      text := p_player::text || ':' || p_cell::text;
  mine     text[];
  oldest   text;
begin
  select * into r from public.poker_rooms where id = p_room for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'no_room'); end if;
  if r.phase <> 'PICK' or now() >= r.phase_ends_at then
    return jsonb_build_object('ok', false, 'error', 'not_pick_phase');
  end if;
  if p_cell < 0 or p_cell > 15 then return jsonb_build_object('ok', false, 'error', 'bad_cell'); end if;

  if r.picks ? key then
    r.picks := r.picks - key;                                   -- 취소
  else
    select array_agg(k order by (r.picks -> k ->> 't')::int)
      into mine
      from jsonb_object_keys(r.picks) k
     where (r.picks -> k ->> 'p')::uuid = p_player;
    if coalesce(array_length(mine, 1), 0) >= 2 then
      oldest := mine[1];
      r.picks := r.picks - oldest;                              -- 가장 먼저 고른 카드 교체
    end if;
    r.pick_seq := r.pick_seq + 1;
    r.picks := r.picks || jsonb_build_object(
      key, jsonb_build_object('p', p_player, 'c', p_cell, 't', r.pick_seq)
    );
  end if;

  update public.poker_rooms
     set picks = r.picks, pick_seq = r.pick_seq, updated_at = now()
   where id = p_room;
  return jsonb_build_object('ok', true, 'picks', r.picks);
end;
$$;

-- create or replace 는 기존 권한을 유지하지만, 확실히 하기 위해 다시 지정
revoke all on function public.poker_pick(uuid, uuid, int) from public, anon, authenticated;
grant execute on function public.poker_pick(uuid, uuid, int) to service_role;
