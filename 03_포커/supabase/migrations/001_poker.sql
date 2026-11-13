-- 기억력 포커 온라인 대전
-- 원칙: 폰(anon)은 읽기만. 모든 쓰기는 Edge Function(service_role)과 아래 security definer 함수만.
--       아직 공개되면 안 되는 카드(외우기 전 그리드, 선택 전 공개 카드)는 poker_secrets 에만 있고 읽기 정책 없음.

create table public.poker_rooms (
  id            uuid primary key default gen_random_uuid(),
  code          text not null unique,                 -- 4자리 방 코드
  host_id       uuid,                                 -- 방장 player id
  phase         text not null default 'LOBBY'
                check (phase in ('LOBBY', 'COUNTDOWN', 'MEMORIZE', 'PICK', 'SHOWDOWN')),
  phase_ends_at timestamptz,                          -- 현재 단계가 끝나는 서버 시각
  round_no      int  not null default 0,
  grid          jsonb,                                -- 외우기 단계부터 공개되는 20장
  community     jsonb,                                -- 선택 단계부터 공개되는 3장
  picks         jsonb not null default '{}'::jsonb,   -- { "칸번호": {"p": player_id, "t": 순서} }
  pick_seq      int  not null default 0,              -- 고른 순서(가장 먼저 고른 카드 교체용)
  result        jsonb,                                -- 결과 화면 데이터
  memorize_sec  int  not null default 30 check (memorize_sec between 1 and 120),
  pick_sec      int  not null default 15 check (pick_sec between 1 and 120),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table public.poker_players (
  id        uuid primary key default gen_random_uuid(),
  room_id   uuid not null references public.poker_rooms(id) on delete cascade,
  nickname  text not null check (char_length(nickname) between 1 and 12),
  seat      int  not null check (seat between 0 and 3),  -- 자리(색) 0~3
  wins      int  not null default 0,
  joined_at timestamptz not null default now(),
  unique (room_id, seat)
);
create index poker_players_room_idx on public.poker_players (room_id);

-- 플레이어 비밀키(해시). 읽기 정책 없음 → 서버만 확인 가능
create table public.poker_player_keys (
  player_id   uuid primary key references public.poker_players(id) on delete cascade,
  secret_hash text not null
);

-- 공개 전 카드. 읽기 정책 없음
create table public.poker_secrets (
  room_id   uuid not null references public.poker_rooms(id) on delete cascade,
  round_no  int  not null,
  grid      jsonb not null,
  community jsonb not null,
  primary key (room_id, round_no)
);

alter table public.poker_rooms       enable row level security;
alter table public.poker_players     enable row level security;
alter table public.poker_player_keys enable row level security;
alter table public.poker_secrets     enable row level security;

-- 읽기만 허용 (방 코드를 아는 사람이 구독). 쓰기 정책은 일부러 없음
create policy "poker rooms readable"   on public.poker_rooms   for select to anon, authenticated using (true);
create policy "poker players readable" on public.poker_players for select to anon, authenticated using (true);

-- 실시간 구독 대상
alter publication supabase_realtime add table public.poker_rooms;
alter publication supabase_realtime add table public.poker_players;

-- 카드 고르기 (동시 클릭을 행 잠금으로 직렬화)
--  - 내 카드를 다시 고르면 취소
--  - 빈 칸: 이미 2장이면 가장 먼저 고른 카드를 빼고 새 카드로 교체
--  - 남이 가진 칸: 실패
create or replace function public.poker_pick(p_room uuid, p_player uuid, p_cell int)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r        public.poker_rooms%rowtype;
  key      text := p_cell::text;
  owner    uuid;
  mine     text[];
  oldest   text;
begin
  select * into r from public.poker_rooms where id = p_room for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'no_room'); end if;
  if r.phase <> 'PICK' or now() >= r.phase_ends_at then
    return jsonb_build_object('ok', false, 'error', 'not_pick_phase');
  end if;
  if p_cell < 0 or p_cell > 19 then return jsonb_build_object('ok', false, 'error', 'bad_cell'); end if;

  owner := (r.picks -> key ->> 'p')::uuid;

  if owner = p_player then
    r.picks := r.picks - key;                                   -- 취소
  elsif owner is null then
    select array_agg(k order by (r.picks -> k ->> 't')::int)
      into mine
      from jsonb_object_keys(r.picks) k
     where (r.picks -> k ->> 'p')::uuid = p_player;
    if coalesce(array_length(mine, 1), 0) >= 2 then
      oldest := mine[1];
      r.picks := r.picks - oldest;                              -- 가장 먼저 고른 카드 교체
    end if;
    r.pick_seq := r.pick_seq + 1;
    r.picks := r.picks || jsonb_build_object(key, jsonb_build_object('p', p_player, 't', r.pick_seq));
  else
    return jsonb_build_object('ok', false, 'error', 'taken');
  end if;

  update public.poker_rooms
     set picks = r.picks, pick_seq = r.pick_seq, updated_at = now()
   where id = p_room;
  return jsonb_build_object('ok', true, 'picks', r.picks);
end;
$$;

-- 폰에서 직접 호출 못 하게 (Edge Function 의 service_role 만)
revoke all on function public.poker_pick(uuid, uuid, int) from public, anon, authenticated;
grant execute on function public.poker_pick(uuid, uuid, int) to service_role;
