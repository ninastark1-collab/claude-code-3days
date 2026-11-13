-- 고구마마켓: 좋아요(관심) + 판매자·구매자 1:1 채팅
-- 가계부 테이블(transactions, budgets)은 건드리지 않아요.

-- ─────────────────────────────────────────────
-- 1) 판매글 카드에 보여 줄 숫자 (♡ 좋아요 수, 💬 채팅방 수)
--    매번 세지 않고, 아래 트리거가 늘리고 줄여 줘요.
-- ─────────────────────────────────────────────
alter table public.items
  add column if not exists like_count integer not null default 0,
  add column if not exists chat_count integer not null default 0;

-- ─────────────────────────────────────────────
-- 2) 좋아요: 누가 어떤 글에 ♡를 눌렀는지 (한 사람이 한 글에 한 번만)
-- ─────────────────────────────────────────────
create table if not exists public.item_likes (
  item_id bigint not null references public.items(id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (item_id, user_id)
);
create index if not exists item_likes_user_idx on public.item_likes (user_id, created_at desc);

alter table public.item_likes enable row level security;

-- 내가 누른 좋아요만 보고, 누르고, 취소할 수 있어요. (누가 눌렀는지는 비공개, 숫자만 공개)
create policy "item_likes_select_own" on public.item_likes
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "item_likes_insert_own" on public.item_likes
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "item_likes_delete_own" on public.item_likes
  for delete to authenticated using ((select auth.uid()) = user_id);

-- ─────────────────────────────────────────────
-- 3) 채팅방: 판매글 하나 + 구매자 한 명 = 방 하나
-- ─────────────────────────────────────────────
create table if not exists public.chat_rooms (
  id bigint generated always as identity primary key,
  item_id bigint not null references public.items(id) on delete cascade,
  seller_id uuid not null references public.profiles(id) on delete cascade,
  buyer_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  last_message text,
  last_message_at timestamptz,
  created_at timestamptz not null default now(),
  unique (item_id, buyer_id),
  check (seller_id <> buyer_id) -- 내 물건에 나 혼자 채팅하는 건 막아요
);
create index if not exists chat_rooms_seller_idx on public.chat_rooms (seller_id, last_message_at desc nulls last);
create index if not exists chat_rooms_buyer_idx on public.chat_rooms (buyer_id, last_message_at desc nulls last);

alter table public.chat_rooms enable row level security;

-- 방에 들어 있는 두 사람(판매자, 구매자)만 볼 수 있어요.
create policy "chat_rooms_select_member" on public.chat_rooms
  for select to authenticated
  using ((select auth.uid()) in (seller_id, buyer_id));

-- 방은 '구매자'가 만들고, 판매자는 그 글의 진짜 판매자여야 해요.
create policy "chat_rooms_insert_buyer" on public.chat_rooms
  for insert to authenticated
  with check (
    (select auth.uid()) = buyer_id
    and seller_id = (select i.seller_id from public.items i where i.id = item_id)
  );

-- ─────────────────────────────────────────────
-- 4) 채팅 메시지
-- ─────────────────────────────────────────────
create table if not exists public.chat_messages (
  id bigint generated always as identity primary key,
  room_id bigint not null references public.chat_rooms(id) on delete cascade,
  sender_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 1000),
  read_at timestamptz, -- 상대방이 읽은 시각 (안 읽었으면 비어 있음)
  created_at timestamptz not null default now()
);
create index if not exists chat_messages_room_idx on public.chat_messages (room_id, created_at);

alter table public.chat_messages enable row level security;

-- 방의 두 사람만 메시지를 볼 수 있어요.
create policy "chat_messages_select_member" on public.chat_messages
  for select to authenticated
  using (exists (
    select 1 from public.chat_rooms r
    where r.id = room_id and (select auth.uid()) in (r.seller_id, r.buyer_id)
  ));

-- 내 이름으로, 내가 들어 있는 방에만 보낼 수 있어요.
create policy "chat_messages_insert_member" on public.chat_messages
  for insert to authenticated
  with check (
    (select auth.uid()) = sender_id
    and exists (
      select 1 from public.chat_rooms r
      where r.id = room_id and (select auth.uid()) in (r.seller_id, r.buyer_id)
    )
  );

-- '읽음 표시'만 할 수 있어요: 상대가 보낸 메시지의 read_at만 바꿀 수 있고, 내용은 못 고쳐요.
create policy "chat_messages_mark_read" on public.chat_messages
  for update to authenticated
  using (
    sender_id <> (select auth.uid())
    and exists (
      select 1 from public.chat_rooms r
      where r.id = room_id and (select auth.uid()) in (r.seller_id, r.buyer_id)
    )
  );
revoke update on public.chat_messages from authenticated, anon;
grant update (read_at) on public.chat_messages to authenticated;

-- ─────────────────────────────────────────────
-- 5) 숫자·마지막 메시지 자동 갱신 트리거
--    security definer: 판매글(items)·채팅방은 본인만 고칠 수 있어서,
--    이 함수만 '관리자 권한'으로 숫자를 바꿔요. 바깥에서 직접 부르지는 못하게 막아요.
-- ─────────────────────────────────────────────
create or replace function public.goguma_like_count()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    update public.items set like_count = like_count + 1 where id = new.item_id;
  else
    update public.items set like_count = greatest(like_count - 1, 0) where id = old.item_id;
  end if;
  return null;
end;
$$;

create or replace function public.goguma_chat_count()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    update public.items set chat_count = chat_count + 1 where id = new.item_id;
  else
    update public.items set chat_count = greatest(chat_count - 1, 0) where id = old.item_id;
  end if;
  return null;
end;
$$;

create or replace function public.goguma_chat_last_message()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.chat_rooms
    set last_message = left(new.body, 100), last_message_at = new.created_at
    where id = new.room_id;
  return null;
end;
$$;

revoke execute on function public.goguma_like_count() from public, anon, authenticated;
revoke execute on function public.goguma_chat_count() from public, anon, authenticated;
revoke execute on function public.goguma_chat_last_message() from public, anon, authenticated;

drop trigger if exists goguma_like_count on public.item_likes;
create trigger goguma_like_count after insert or delete on public.item_likes
  for each row execute function public.goguma_like_count();

drop trigger if exists goguma_chat_count on public.chat_rooms;
create trigger goguma_chat_count after insert or delete on public.chat_rooms
  for each row execute function public.goguma_chat_count();

drop trigger if exists goguma_chat_last_message on public.chat_messages;
create trigger goguma_chat_last_message after insert on public.chat_messages
  for each row execute function public.goguma_chat_last_message();

-- 숫자 칸이 바뀌어도 '수정됨' 표시가 생기지 않게: 글 내용이 바뀔 때만 updated_at을 갱신해요.
create or replace function public.items_touch_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  if (new.title, new.description, new.price, new.category, new.status, new.photos)
     is distinct from (old.title, old.description, old.price, old.category, old.status, old.photos) then
    new.updated_at = now();
  end if;
  return new;
end;
$$;

-- ─────────────────────────────────────────────
-- 6) 실시간(Realtime): 새 메시지가 오면 화면에 바로 뜨게
--    (RLS가 그대로 적용돼서, 방의 두 사람에게만 전달돼요)
-- ─────────────────────────────────────────────
alter publication supabase_realtime add table public.chat_messages;
