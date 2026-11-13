-- 고구마마켓: 판매글 댓글
-- 가계부 테이블(transactions, budgets)은 건드리지 않아요.

create table if not exists public.item_comments (
  id bigint generated always as identity primary key,
  item_id bigint not null references public.items(id) on delete cascade,
  author_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 500),
  created_at timestamptz not null default now()
);
create index if not exists item_comments_item_idx on public.item_comments (item_id, created_at);
create index if not exists item_comments_author_idx on public.item_comments (author_id);

alter table public.item_comments enable row level security;

-- 댓글은 로그인하지 않은 사람도 볼 수 있어요.
create policy "item_comments_select_all" on public.item_comments
  for select using (true);

-- 쓰기: 로그인한 사람이 '내 이름으로'만 쓸 수 있어요.
create policy "item_comments_insert_own" on public.item_comments
  for insert to authenticated
  with check ((select auth.uid()) = author_id);

-- 지우기: 댓글 쓴 사람, 또는 그 판매글의 판매자(내 글에 달린 댓글 정리용)
create policy "item_comments_delete_author_or_seller" on public.item_comments
  for delete to authenticated
  using (
    (select auth.uid()) = author_id
    or (select auth.uid()) = (select i.seller_id from public.items i where i.id = item_id)
  );

-- 고치기는 없어요. (쓴 내용을 나중에 바꿔서 대화 흐름이 어긋나는 걸 막아요)
