-- 고구마마켓: 판매글(매물) 테이블
-- 사진은 아직 넣지 않아요. (사진 업로드는 다음 단계에서 Supabase Storage로 추가할 예정)
-- 가계부(transactions, budgets)와 같은 DB를 쓰므로 그 테이블들은 건드리지 않습니다.

create table if not exists public.items (
  id bigint generated always as identity primary key,
  -- 판매자. profiles를 가리켜야 목록에서 판매자 닉네임을 함께 불러올 수 있어요.
  seller_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  title text not null check (char_length(title) between 2 and 40),
  description text not null default '' check (char_length(description) <= 2000),
  price integer not null check (price between 0 and 100000000),   -- 0 = 나눔
  category text not null check (category in (
    'digital','appliance','furniture','kitchen','kids','clothes','goods','beauty',
    'sports','hobby','books','tickets','food','pets','plants','etc'
  )),
  region text,                                                     -- 글 쓸 때의 판매자 동네
  status text not null default '판매중' check (status in ('판매중', '예약중', '거래완료')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 자주 찾는 방식(최신순, 카테고리별, 내 글)을 빠르게 하기 위한 색인
create index if not exists items_created_at_idx on public.items (created_at desc);
create index if not exists items_category_idx on public.items (category, created_at desc);
create index if not exists items_seller_idx on public.items (seller_id);

-- RLS(행 단위 보안): 누가 어떤 줄을 보고/고칠 수 있는지 DB가 직접 검사해요.
alter table public.items enable row level security;

-- 판매글은 로그인하지 않은 사람도 볼 수 있어요.
create policy "items_select_all" on public.items
  for select using (true);

-- 글쓰기·수정·삭제는 로그인한 본인 글만 가능해요.
create policy "items_insert_own" on public.items
  for insert to authenticated
  with check ((select auth.uid()) = seller_id);

create policy "items_update_own" on public.items
  for update to authenticated
  using ((select auth.uid()) = seller_id)
  with check ((select auth.uid()) = seller_id);

create policy "items_delete_own" on public.items
  for delete to authenticated
  using ((select auth.uid()) = seller_id);

-- 글을 고칠 때마다 updated_at을 자동으로 지금 시각으로 바꿔 주는 트리거
create or replace function public.items_touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke execute on function public.items_touch_updated_at() from public, anon, authenticated;

drop trigger if exists items_touch_updated_at on public.items;
create trigger items_touch_updated_at
  before update on public.items
  for each row execute function public.items_touch_updated_at();
