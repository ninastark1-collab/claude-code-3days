-- 같은 카드를 여러 명이 고를 수 있게 변경
--   picks 모양:  { "칸번호": {"p": player_id, "t": 순서} }   (이전)
--            →  { "칸번호": [ {"p": player_id, "t": 순서}, ... ] }   (이후)
-- 카드판은 4열 × 4행 = 16장 (칸 번호 0~15), 외우는 시간 기본값 20초 / 고르는 시간 15초
alter table public.poker_rooms alter column memorize_sec set default 20;

-- 진행 중이던 방의 picks 는 모양이 달라 비움 (선택 단계에서만 의미가 있음)
update public.poker_rooms set picks = '{}'::jsonb where picks <> '{}'::jsonb;

-- 한 칸에서 특정 플레이어의 선택만 뺌 (남은 사람이 없으면 칸을 지움)
create or replace function public.poker_drop_pick(p_picks jsonb, p_cell text, p_player uuid)
returns jsonb
language sql
immutable
as $$
  select case
    when rest is null then p_picks - p_cell
    else jsonb_set(p_picks, array[p_cell], rest)
  end
  from (
    select jsonb_agg(o) as rest
      from jsonb_array_elements(coalesce(p_picks -> p_cell, '[]'::jsonb)) o
     where (o ->> 'p')::uuid <> p_player
  ) x;
$$;
revoke all on function public.poker_drop_pick(jsonb, text, uuid) from public, anon, authenticated;

-- 카드 고르기 (동시 클릭을 행 잠금으로 직렬화)
--  - 내 카드를 다시 고르면 취소
--  - 이미 2장이면 가장 먼저 고른 카드를 빼고 새 카드로 교체
--  - 다른 사람이 고른 칸도 고를 수 있음 (같은 카드를 여러 명이 가질 수 있음)
create or replace function public.poker_pick(p_room uuid, p_player uuid, p_cell int)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r        public.poker_rooms%rowtype;
  key      text := p_cell::text;
  mine     text[];
begin
  select * into r from public.poker_rooms where id = p_room for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'no_room'); end if;
  if r.phase <> 'PICK' or now() >= r.phase_ends_at then
    return jsonb_build_object('ok', false, 'error', 'not_pick_phase');
  end if;
  if p_cell < 0 or p_cell > 15 then return jsonb_build_object('ok', false, 'error', 'bad_cell'); end if;

  if exists (
    select 1 from jsonb_array_elements(coalesce(r.picks -> key, '[]'::jsonb)) o
     where (o ->> 'p')::uuid = p_player
  ) then
    r.picks := public.poker_drop_pick(r.picks, key, p_player);   -- 취소
  else
    select array_agg(k order by t)
      into mine
      from (
        select e.k, (o ->> 't')::int as t
          from jsonb_each(r.picks) as e(k, v), jsonb_array_elements(e.v) o
         where (o ->> 'p')::uuid = p_player
      ) x;
    if coalesce(array_length(mine, 1), 0) >= 2 then
      r.picks := public.poker_drop_pick(r.picks, mine[1], p_player);   -- 가장 먼저 고른 카드 교체
    end if;
    r.pick_seq := r.pick_seq + 1;
    r.picks := jsonb_set(
      r.picks, array[key],
      coalesce(r.picks -> key, '[]'::jsonb) || jsonb_build_array(jsonb_build_object('p', p_player, 't', r.pick_seq)),
      true
    );
  end if;

  update public.poker_rooms
     set picks = r.picks, pick_seq = r.pick_seq, updated_at = now()
   where id = p_room;
  return jsonb_build_object('ok', true, 'picks', r.picks);
end;
$$;

revoke all on function public.poker_pick(uuid, uuid, int) from public, anon, authenticated;
grant execute on function public.poker_pick(uuid, uuid, int) to service_role;
