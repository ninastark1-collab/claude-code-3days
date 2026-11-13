-- 고구마마켓: 근처 동네 보기
-- 동네 위치표: "여주시 가남읍" → 그 동네 '중심'의 위도·경도.
-- 사람의 실제 위치(GPS)는 저장하지 않아요. 동네 이름마다 한 줄씩만 있어요.
-- 홈에서 "근처 동네"를 고르면, 내 동네에서 n km 안에 있는 동네 이름들을 찾아 그 동네 글을 함께 보여 줘요.

create table if not exists public.goguma_regions (
  name text primary key check (char_length(name) between 1 and 30),
  lat double precision not null check (lat between 33 and 39),   -- 한국 안쪽만
  lng double precision not null check (lng between 124 and 132),
  created_at timestamptz not null default now()
);
alter table public.goguma_regions enable row level security;

-- 누구나 읽을 수 있어요. (동네 중심 좌표는 공개 지도 정보예요)
create policy "goguma_regions_select_all" on public.goguma_regions for select using (true);

-- 새 동네는 '지금 내 프로필에 적힌 동네 이름'만 추가할 수 있어요. 고치기·지우기는 안 돼요.
-- (서버가 지도 서비스로 찾은 좌표를 넣어요. 이미 있는 동네의 좌표는 아무도 못 바꿔요)
create policy "goguma_regions_insert_own_region" on public.goguma_regions
  for insert to authenticated
  with check (name = (select p.region from public.profiles p where p.id = (select auth.uid())));

-- 홈에서 판매글을 동네 이름으로 자주 찾아서 색인(찾아보기)을 달아요.
create index if not exists items_region_idx on public.items (region);
