-- 고구마마켓 6단계: 거래 마무리·후기·고구마 온도, 알림, 신고·차단, 도배 방지,
--                  끌어올리기·가격 제안, 채팅 사진·나가기, 동네생활 게시판, 프로필 이모지, 탈퇴
-- 가계부 테이블(transactions, budgets)은 건드리지 않아요.

-- ═════════════════════════════════════════════
-- 0) 내부 전용 도우미 함수를 넣을 곳
--    goguma_private 스키마는 API(PostgREST)로 열려 있지 않아서, 바깥에서 직접 부를 수 없어요.
-- ═════════════════════════════════════════════
create schema if not exists goguma_private;
revoke all on schema goguma_private from public, anon;
grant usage on schema goguma_private to authenticated;

-- ═════════════════════════════════════════════
-- 1) 프로필: 이모지 프로필 + 고구마 온도
-- ═════════════════════════════════════════════
alter table public.profiles
  add column if not exists avatar text not null default '🍠' check (char_length(avatar) between 1 and 8),
  add column if not exists manner_temp numeric(4,1) not null default 36.5;

-- 고구마 온도는 후기로만 바뀌어야 해요 → 사용자는 닉네임·동네·프로필 이모지만 고칠 수 있게.
revoke update on public.profiles from authenticated, anon;
grant update (nickname, region, avatar) on public.profiles to authenticated;

-- ═════════════════════════════════════════════
-- 2) 판매글: 구매자(거래완료 상대), 끌어올리기, 가격 제안 받기
-- ═════════════════════════════════════════════
alter table public.items
  add column if not exists buyer_id uuid references public.profiles(id) on delete set null,
  add column if not exists bumped_at timestamptz,
  add column if not exists accept_offers boolean not null default false;
update public.items set bumped_at = created_at where bumped_at is null;
alter table public.items alter column bumped_at set default now(), alter column bumped_at set not null;
create index if not exists items_bumped_at_idx on public.items (bumped_at desc);
create index if not exists items_buyer_idx on public.items (buyer_id);
create index if not exists items_region_idx on public.items (region, bumped_at desc);

-- 구매자는 '이 글로 나와 채팅한 사람' 중에서만 고를 수 있어요.
drop policy if exists "items_update_own" on public.items;
create policy "items_update_own" on public.items
  for update to authenticated
  using ((select auth.uid()) = seller_id)
  with check (
    (select auth.uid()) = seller_id
    and (
      buyer_id is null
      or exists (select 1 from public.chat_rooms r where r.item_id = items.id and r.buyer_id = items.buyer_id)
    )
  );

-- 글 내용이 바뀔 때만 '수정됨', 거래완료가 아니면 구매자 비우기, 끌어올리기는 하루 한 번
create or replace function public.items_touch_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  if (new.title, new.description, new.price, new.category, new.status, new.photos, new.accept_offers)
     is distinct from (old.title, old.description, old.price, old.category, old.status, old.photos, old.accept_offers) then
    new.updated_at = now();
  end if;
  if new.status <> '거래완료' then
    new.buyer_id = null;
  end if;
  if new.bumped_at is distinct from old.bumped_at then
    if old.bumped_at > now() - interval '24 hours' then
      raise exception 'bump_too_soon' using errcode = 'P0001';
    end if;
    new.bumped_at = now();
  end if;
  return new;
end;
$$;

-- ═════════════════════════════════════════════
-- 3) 차단: 서로의 글·댓글이 안 보이고, 채팅을 시작하거나 보낼 수 없어요.
-- ═════════════════════════════════════════════
create table if not exists public.user_blocks (
  blocker_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  blocked_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);
create index if not exists user_blocks_blocked_idx on public.user_blocks (blocked_id);
alter table public.user_blocks enable row level security;
create policy "user_blocks_select_own" on public.user_blocks
  for select to authenticated using ((select auth.uid()) = blocker_id);
create policy "user_blocks_insert_own" on public.user_blocks
  for insert to authenticated with check ((select auth.uid()) = blocker_id);
create policy "user_blocks_delete_own" on public.user_blocks
  for delete to authenticated using ((select auth.uid()) = blocker_id);

-- 두 사람 사이에 차단이 있는지 (어느 쪽이 했든). 정책 안에서 써요.
create or replace function goguma_private.is_blocked(a uuid, b uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.user_blocks
    where (blocker_id = a and blocked_id = b) or (blocker_id = b and blocked_id = a)
  );
$$;
revoke all on function goguma_private.is_blocked(uuid, uuid) from public, anon;
grant execute on function goguma_private.is_blocked(uuid, uuid) to authenticated;

-- 차단한 사이면 채팅방을 새로 못 열어요.
drop policy if exists "chat_rooms_insert_buyer" on public.chat_rooms;
create policy "chat_rooms_insert_buyer" on public.chat_rooms
  for insert to authenticated
  with check (
    (select auth.uid()) = buyer_id
    and seller_id = (select i.seller_id from public.items i where i.id = item_id)
    and not goguma_private.is_blocked(buyer_id, seller_id)
  );

-- ═════════════════════════════════════════════
-- 4) 채팅: 사진 보내기 + 채팅방 나가기
-- ═════════════════════════════════════════════
alter table public.chat_messages add column if not exists image_path text;
alter table public.chat_messages drop constraint if exists chat_messages_body_check;
alter table public.chat_messages add constraint chat_messages_body_check check (
  char_length(body) <= 1000
  and (char_length(btrim(body)) >= 1 or image_path is not null)
);
-- 사진 경로는 "방번호/무작위이름.jpg" 모양이고, 반드시 이 방 폴더여야 해요.
alter table public.chat_messages add constraint chat_messages_image_path_check check (
  image_path is null or image_path ~ ('^' || room_id::text || '/[0-9a-f-]{36}\.jpg$')
);

-- 차단한 사이면 메시지를 못 보내요.
drop policy if exists "chat_messages_insert_member" on public.chat_messages;
create policy "chat_messages_insert_member" on public.chat_messages
  for insert to authenticated
  with check (
    (select auth.uid()) = sender_id
    and exists (
      select 1 from public.chat_rooms r
      where r.id = room_id
        and (select auth.uid()) in (r.seller_id, r.buyer_id)
        and not goguma_private.is_blocked(r.seller_id, r.buyer_id)
    )
  );

-- 나가기: 내 쪽 '나간 시각'만 기록해요. (상대가 새 메시지를 보내면 목록에 다시 나타나요)
alter table public.chat_rooms
  add column if not exists seller_left_at timestamptz,
  add column if not exists buyer_left_at timestamptz;
revoke update on public.chat_rooms from authenticated, anon;
grant update (seller_left_at, buyer_left_at) on public.chat_rooms to authenticated;
create policy "chat_rooms_update_member" on public.chat_rooms
  for update to authenticated
  using ((select auth.uid()) in (seller_id, buyer_id))
  with check ((select auth.uid()) in (seller_id, buyer_id));

-- 판매자는 판매자 쪽, 구매자는 구매자 쪽 '나간 시각'만 바꿀 수 있게 지켜요.
create or replace function public.chat_rooms_guard_left()
returns trigger language plpgsql set search_path = '' as $$
begin
  if auth.uid() = old.buyer_id then
    new.seller_left_at = old.seller_left_at;
  elsif auth.uid() = old.seller_id then
    new.buyer_left_at = old.buyer_left_at;
  end if;
  return new;
end;
$$;
revoke execute on function public.chat_rooms_guard_left() from public, anon, authenticated;
drop trigger if exists chat_rooms_guard_left on public.chat_rooms;
create trigger chat_rooms_guard_left before update on public.chat_rooms
  for each row execute function public.chat_rooms_guard_left();

-- 채팅 사진 전용 '비공개' 버킷: 방의 두 사람만 올리고 볼 수 있어요.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('goguma-chat-photos', 'goguma-chat-photos', false, 5242880, array['image/jpeg'])
on conflict (id) do update
  set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create or replace function goguma_private.is_room_member(room_folder text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.chat_rooms r
    where r.id::text = room_folder
      and (select auth.uid()) in (r.seller_id, r.buyer_id)
      and not goguma_private.is_blocked(r.seller_id, r.buyer_id)
  );
$$;
revoke all on function goguma_private.is_room_member(text) from public, anon;
grant execute on function goguma_private.is_room_member(text) to authenticated;

create policy "goguma_chat_photos_insert_member" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'goguma-chat-photos' and goguma_private.is_room_member((storage.foldername(name))[1]));
create policy "goguma_chat_photos_select_member" on storage.objects
  for select to authenticated
  using (bucket_id = 'goguma-chat-photos' and goguma_private.is_room_member((storage.foldername(name))[1]));

-- ═════════════════════════════════════════════
-- 5) 거래 후기 → 고구마 온도
-- ═════════════════════════════════════════════
create table if not exists public.item_reviews (
  id bigint generated always as identity primary key,
  item_id bigint not null references public.items(id) on delete cascade,
  reviewer_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  reviewee_id uuid not null references public.profiles(id) on delete cascade,
  rating text not null check (rating in ('good', 'soso', 'bad')),
  body text not null default '' check (char_length(body) <= 300),
  created_at timestamptz not null default now(),
  unique (item_id, reviewer_id)
);
create index if not exists item_reviews_reviewee_idx on public.item_reviews (reviewee_id, created_at desc);
create index if not exists item_reviews_reviewer_idx on public.item_reviews (reviewer_id);
alter table public.item_reviews enable row level security;
create policy "item_reviews_select_all" on public.item_reviews for select using (true);
-- 거래완료된 글의 판매자↔구매자끼리만, 서로에게 한 번씩 남길 수 있어요.
create policy "item_reviews_insert_party" on public.item_reviews
  for insert to authenticated
  with check (
    (select auth.uid()) = reviewer_id
    and exists (
      select 1 from public.items i
      where i.id = item_id and i.status = '거래완료' and i.buyer_id is not null
        and (
          ((select auth.uid()) = i.seller_id and reviewee_id = i.buyer_id)
          or ((select auth.uid()) = i.buyer_id and reviewee_id = i.seller_id)
        )
    )
  );

create or replace function public.goguma_review_temp()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.profiles
    set manner_temp = least(99, greatest(0,
      manner_temp + case new.rating when 'good' then 0.5 when 'bad' then -1.0 else 0.1 end))
    where id = new.reviewee_id;
  return null;
end;
$$;
revoke execute on function public.goguma_review_temp() from public, anon, authenticated;
drop trigger if exists goguma_review_temp on public.item_reviews;
create trigger goguma_review_temp after insert on public.item_reviews
  for each row execute function public.goguma_review_temp();

-- ═════════════════════════════════════════════
-- 6) 신고 (관리 화면은 아직 없어요. Supabase 대시보드에서 확인)
-- ═════════════════════════════════════════════
create table if not exists public.reports (
  id bigint generated always as identity primary key,
  reporter_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  target_type text not null check (target_type in ('item', 'user', 'comment', 'chat', 'post')),
  target_id text not null check (char_length(target_id) <= 64),
  reason text not null check (reason in ('사기 의심', '판매 금지 물품', '욕설·비방', '스팸·광고', '기타')),
  detail text not null default '' check (char_length(detail) <= 500),
  created_at timestamptz not null default now()
);
create index if not exists reports_reporter_idx on public.reports (reporter_id);
alter table public.reports enable row level security;
create policy "reports_insert_own" on public.reports
  for insert to authenticated with check ((select auth.uid()) = reporter_id);
create policy "reports_select_own" on public.reports
  for select to authenticated using ((select auth.uid()) = reporter_id);

-- ═════════════════════════════════════════════
-- 7) 동네생활 게시판
-- ═════════════════════════════════════════════
create table if not exists public.community_posts (
  id bigint generated always as identity primary key,
  author_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  region text,
  topic text not null check (topic in ('일상', '질문', '맛집', '분실·실종', '동네소식')),
  body text not null check (char_length(btrim(body)) between 2 and 2000),
  comment_count integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists community_posts_created_idx on public.community_posts (created_at desc);
create index if not exists community_posts_author_idx on public.community_posts (author_id);
alter table public.community_posts enable row level security;
create policy "community_posts_select_all" on public.community_posts for select using (true);
create policy "community_posts_insert_own" on public.community_posts
  for insert to authenticated with check ((select auth.uid()) = author_id);
create policy "community_posts_delete_own" on public.community_posts
  for delete to authenticated using ((select auth.uid()) = author_id);

create table if not exists public.community_comments (
  id bigint generated always as identity primary key,
  post_id bigint not null references public.community_posts(id) on delete cascade,
  author_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 500),
  created_at timestamptz not null default now()
);
create index if not exists community_comments_post_idx on public.community_comments (post_id, created_at);
create index if not exists community_comments_author_idx on public.community_comments (author_id);
alter table public.community_comments enable row level security;
create policy "community_comments_select_all" on public.community_comments for select using (true);
create policy "community_comments_insert_own" on public.community_comments
  for insert to authenticated with check ((select auth.uid()) = author_id);
create policy "community_comments_delete_author_or_poster" on public.community_comments
  for delete to authenticated
  using (
    (select auth.uid()) = author_id
    or (select auth.uid()) = (select p.author_id from public.community_posts p where p.id = post_id)
  );

create or replace function public.goguma_post_comment_count()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    update public.community_posts set comment_count = comment_count + 1 where id = new.post_id;
  else
    update public.community_posts set comment_count = greatest(comment_count - 1, 0) where id = old.post_id;
  end if;
  return null;
end;
$$;
revoke execute on function public.goguma_post_comment_count() from public, anon, authenticated;
drop trigger if exists goguma_post_comment_count on public.community_comments;
create trigger goguma_post_comment_count after insert or delete on public.community_comments
  for each row execute function public.goguma_post_comment_count();

-- ═════════════════════════════════════════════
-- 8) 알림: 내 글에 댓글·좋아요, 후기, 거래완료, 동네생활 댓글
--    알림은 트리거만 만들 수 있고, 사용자는 내 알림을 보고·읽음 표시·지우기만 해요.
-- ═════════════════════════════════════════════
create table if not exists public.notifications (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  type text not null check (type in ('comment', 'like', 'review', 'sold', 'post_comment')),
  item_id bigint references public.items(id) on delete cascade,
  post_id bigint references public.community_posts(id) on delete cascade,
  body text not null default '',
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists notifications_user_idx on public.notifications (user_id, created_at desc);
create index if not exists notifications_actor_idx on public.notifications (actor_id);
create index if not exists notifications_item_idx on public.notifications (item_id);
create index if not exists notifications_post_idx on public.notifications (post_id);
alter table public.notifications enable row level security;
create policy "notifications_select_own" on public.notifications
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "notifications_update_own" on public.notifications
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "notifications_delete_own" on public.notifications
  for delete to authenticated using ((select auth.uid()) = user_id);
revoke insert, update on public.notifications from authenticated, anon;
grant update (read_at) on public.notifications to authenticated;

create or replace function public.goguma_notify()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_seller uuid; v_author uuid;
begin
  if tg_table_name = 'item_comments' then
    select seller_id into v_seller from public.items where id = new.item_id;
    if v_seller is not null and v_seller <> new.author_id then
      insert into public.notifications (user_id, actor_id, type, item_id, body)
      values (v_seller, new.author_id, 'comment', new.item_id, left(new.body, 80));
    end if;
  elsif tg_table_name = 'item_likes' then
    select seller_id into v_seller from public.items where id = new.item_id;
    if v_seller is not null and v_seller <> new.user_id then
      -- 눌렀다 취소했다 반복해도 알림이 쌓이지 않게, 같은 사람의 예전 좋아요 알림은 지워요.
      delete from public.notifications
        where user_id = v_seller and actor_id = new.user_id and type = 'like' and item_id = new.item_id;
      insert into public.notifications (user_id, actor_id, type, item_id)
      values (v_seller, new.user_id, 'like', new.item_id);
    end if;
  elsif tg_table_name = 'item_reviews' then
    insert into public.notifications (user_id, actor_id, type, item_id, body)
    values (new.reviewee_id, new.reviewer_id, 'review', new.item_id, left(new.body, 80));
  elsif tg_table_name = 'items' then
    if new.status = '거래완료' and new.buyer_id is not null and new.buyer_id is distinct from old.buyer_id then
      insert into public.notifications (user_id, actor_id, type, item_id)
      values (new.buyer_id, new.seller_id, 'sold', new.id);
    end if;
  elsif tg_table_name = 'community_comments' then
    select author_id into v_author from public.community_posts where id = new.post_id;
    if v_author is not null and v_author <> new.author_id then
      insert into public.notifications (user_id, actor_id, type, post_id, body)
      values (v_author, new.author_id, 'post_comment', new.post_id, left(new.body, 80));
    end if;
  end if;
  return null;
end;
$$;
revoke execute on function public.goguma_notify() from public, anon, authenticated;

drop trigger if exists goguma_notify on public.item_comments;
create trigger goguma_notify after insert on public.item_comments for each row execute function public.goguma_notify();
drop trigger if exists goguma_notify on public.item_likes;
create trigger goguma_notify after insert on public.item_likes for each row execute function public.goguma_notify();
drop trigger if exists goguma_notify on public.item_reviews;
create trigger goguma_notify after insert on public.item_reviews for each row execute function public.goguma_notify();
drop trigger if exists goguma_notify on public.items;
create trigger goguma_notify after update on public.items for each row execute function public.goguma_notify();
drop trigger if exists goguma_notify on public.community_comments;
create trigger goguma_notify after insert on public.community_comments for each row execute function public.goguma_notify();

-- ═════════════════════════════════════════════
-- 9) 도배 방지: 짧은 시간에 너무 많이 쓰면 막아요.
-- ═════════════════════════════════════════════
create or replace function public.goguma_rate_limit()
returns trigger language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  if tg_table_name = 'chat_messages' then
    select count(*) into n from public.chat_messages where sender_id = new.sender_id and created_at > now() - interval '1 minute';
    if n >= 20 then raise exception 'rate_limited' using errcode = 'P0001'; end if;
  elsif tg_table_name = 'item_comments' then
    select count(*) into n from public.item_comments where author_id = new.author_id and created_at > now() - interval '1 minute';
    if n >= 5 then raise exception 'rate_limited' using errcode = 'P0001'; end if;
  elsif tg_table_name = 'items' then
    select count(*) into n from public.items where seller_id = new.seller_id and created_at > now() - interval '1 hour';
    if n >= 10 then raise exception 'rate_limited' using errcode = 'P0001'; end if;
  elsif tg_table_name = 'reports' then
    select count(*) into n from public.reports where reporter_id = new.reporter_id and created_at > now() - interval '1 hour';
    if n >= 10 then raise exception 'rate_limited' using errcode = 'P0001'; end if;
  elsif tg_table_name = 'community_posts' then
    select count(*) into n from public.community_posts where author_id = new.author_id and created_at > now() - interval '10 minutes';
    if n >= 5 then raise exception 'rate_limited' using errcode = 'P0001'; end if;
  elsif tg_table_name = 'community_comments' then
    select count(*) into n from public.community_comments where author_id = new.author_id and created_at > now() - interval '1 minute';
    if n >= 5 then raise exception 'rate_limited' using errcode = 'P0001'; end if;
  end if;
  return new;
end;
$$;
revoke execute on function public.goguma_rate_limit() from public, anon, authenticated;

drop trigger if exists goguma_rate_limit on public.chat_messages;
create trigger goguma_rate_limit before insert on public.chat_messages for each row execute function public.goguma_rate_limit();
drop trigger if exists goguma_rate_limit on public.item_comments;
create trigger goguma_rate_limit before insert on public.item_comments for each row execute function public.goguma_rate_limit();
drop trigger if exists goguma_rate_limit on public.items;
create trigger goguma_rate_limit before insert on public.items for each row execute function public.goguma_rate_limit();
drop trigger if exists goguma_rate_limit on public.reports;
create trigger goguma_rate_limit before insert on public.reports for each row execute function public.goguma_rate_limit();
drop trigger if exists goguma_rate_limit on public.community_posts;
create trigger goguma_rate_limit before insert on public.community_posts for each row execute function public.goguma_rate_limit();
drop trigger if exists goguma_rate_limit on public.community_comments;
create trigger goguma_rate_limit before insert on public.community_comments for each row execute function public.goguma_rate_limit();

-- ═════════════════════════════════════════════
-- 10) 회원 탈퇴: 본인 계정만 지울 수 있어요.
--     auth.users를 지우면 profiles → 판매글·댓글·채팅이 줄줄이 지워져요(on delete cascade).
--     ※ 가계부는 로그인을 쓰지 않아서 영향이 없어요.
-- ═════════════════════════════════════════════
create or replace function public.delete_my_goguma_account()
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then
    raise exception 'not_logged_in' using errcode = 'P0001';
  end if;
  delete from auth.users where id = auth.uid();
end;
$$;
revoke all on function public.delete_my_goguma_account() from public, anon;
grant execute on function public.delete_my_goguma_account() to authenticated;
