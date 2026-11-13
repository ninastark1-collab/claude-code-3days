-- 고구마마켓 8단계: 대댓글, 접속 상태, 거래 약속(구매확정→예약중→거래완료),
--                  상품 상태·거래 방법, 조회수, 관심 상품 가격 내림 알림
-- 가계부 테이블(transactions, budgets)은 건드리지 않아요.

-- ═════════════════════════════════════════════
-- 0) 내부 작업 표시: 트리거끼리 서로 상태를 바꿀 때는 '사람이 누른 것'이 아니라서 검사를 건너뛰어요.
-- ═════════════════════════════════════════════
create or replace function goguma_private.is_internal()
returns boolean language sql stable set search_path = '' as $$
  select coalesce(current_setting('goguma.internal', true), '') = '1';
$$;
grant execute on function goguma_private.is_internal() to authenticated;

-- ═════════════════════════════════════════════
-- 1) 대댓글: 댓글에 답글 (한 단계만)
-- ═════════════════════════════════════════════
alter table public.item_comments add column if not exists parent_id bigint references public.item_comments(id) on delete cascade;
alter table public.community_comments add column if not exists parent_id bigint references public.community_comments(id) on delete cascade;
create index if not exists item_comments_parent_idx on public.item_comments (parent_id);
create index if not exists community_comments_parent_idx on public.community_comments (parent_id);

-- 답글의 부모는 '같은 글'의 '원댓글'이어야 해요. (답글에 답글은 안 돼요)
create or replace function public.goguma_reply_guard()
returns trigger language plpgsql set search_path = '' as $$
declare ok boolean;
begin
  if new.parent_id is null then return new; end if;
  if tg_table_name = 'item_comments' then
    select exists (select 1 from public.item_comments p where p.id = new.parent_id and p.item_id = new.item_id and p.parent_id is null) into ok;
  else
    select exists (select 1 from public.community_comments p where p.id = new.parent_id and p.post_id = new.post_id and p.parent_id is null) into ok;
  end if;
  if not ok then raise exception 'bad_parent' using errcode = 'P0001'; end if;
  return new;
end;
$$;
revoke execute on function public.goguma_reply_guard() from public, anon, authenticated;
drop trigger if exists goguma_reply_guard on public.item_comments;
create trigger goguma_reply_guard before insert on public.item_comments for each row execute function public.goguma_reply_guard();
drop trigger if exists goguma_reply_guard on public.community_comments;
create trigger goguma_reply_guard before insert on public.community_comments for each row execute function public.goguma_reply_guard();

-- ═════════════════════════════════════════════
-- 2) 접속 상태: 마지막 접속 시각 + 공개 여부
-- ═════════════════════════════════════════════
alter table public.profiles
  add column if not exists last_seen_at timestamptz,
  add column if not exists show_online boolean not null default true;
grant update (last_seen_at, show_online) on public.profiles to authenticated;

-- 마지막 접속 시각은 '지금'으로만, 공개를 끄면 지워요. (기존 동네 인증 규칙도 같이)
create or replace function public.profiles_guard_region()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.region_verified_at is distinct from old.region_verified_at then
    if new.region_verified_at is not null then new.region_verified_at = now(); end if;
  elsif new.region is distinct from old.region then
    new.region_verified_at = null;
  end if;
  if new.last_seen_at is distinct from old.last_seen_at and new.last_seen_at is not null then
    new.last_seen_at = now();
  end if;
  if not new.show_online then
    new.last_seen_at = null;
  end if;
  return new;
end;
$$;

-- ═════════════════════════════════════════════
-- 3) 상품 정보: 상태·거래 방법·조회수
-- ═════════════════════════════════════════════
alter table public.items
  add column if not exists condition text not null default '사용감 있음'
    check (condition in ('새상품', '거의 새것', '사용감 있음', '고장·부품용')),
  add column if not exists trade_method text not null default '직거래'
    check (trade_method in ('직거래', '택배', '직거래·택배')),
  add column if not exists view_count integer not null default 0;

-- 조회 기록: 같은 사람(또는 같은 브라우저)은 하루 한 번만 세요. 누가 봤는지는 아무도 못 봐요(읽기 정책 없음).
create table if not exists public.item_views (
  item_id bigint not null references public.items(id) on delete cascade,
  viewer text not null check (viewer ~ '^[0-9a-zA-Z-]{8,64}$'),
  day date not null default (now() at time zone 'Asia/Seoul')::date,
  primary key (item_id, viewer, day)
);
alter table public.item_views enable row level security;
create policy "item_views_insert_any" on public.item_views for insert to anon, authenticated with check (true);

create or replace function public.goguma_view_count()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform set_config('goguma.internal', '1', true);
  update public.items set view_count = view_count + 1 where id = new.item_id;
  perform set_config('goguma.internal', '', true);
  return null;
end;
$$;
revoke execute on function public.goguma_view_count() from public, anon, authenticated;
drop trigger if exists goguma_view_count on public.item_views;
create trigger goguma_view_count after insert on public.item_views for each row execute function public.goguma_view_count();

-- 글 '수정됨'은 내용이 바뀔 때만 (판매 상태 변경은 수정으로 치지 않아요)
-- 구매자는 예약중·거래완료일 때만 남기고, 판매중으로 돌아가면 비워요.
create or replace function public.items_touch_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  if (new.title, new.description, new.price, new.category, new.photos, new.accept_offers, new.condition, new.trade_method)
     is distinct from (old.title, old.description, old.price, old.category, old.photos, old.accept_offers, old.condition, old.trade_method) then
    new.updated_at = now();
  end if;
  if new.status = '판매중' then
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
-- 4) 채팅 시스템 안내 메시지 (거래 약속 진행 상황을 대화방에 남겨요)
-- ═════════════════════════════════════════════
alter table public.chat_messages
  add column if not exists kind text not null default 'text' check (kind in ('text', 'system'));
-- 사람은 안내 메시지를 직접 못 넣어요. (트리거만)
drop policy if exists "chat_messages_insert_member" on public.chat_messages;
create policy "chat_messages_insert_member" on public.chat_messages
  for insert to authenticated
  with check (
    (select auth.uid()) = sender_id
    and kind = 'text'
    and exists (
      select 1 from public.chat_rooms r
      where r.id = room_id
        and (select auth.uid()) in (r.seller_id, r.buyer_id)
        and not goguma_private.is_blocked(r.seller_id, r.buyer_id)
    )
  );

-- ═════════════════════════════════════════════
-- 5) 거래 약속(deals): 제안 → 수락(예약중) → 거래완료 / 취소·거절
-- ═════════════════════════════════════════════
create table if not exists public.deals (
  id bigint generated always as identity primary key,
  room_id bigint not null references public.chat_rooms(id) on delete cascade,
  item_id bigint not null references public.items(id) on delete cascade,
  seller_id uuid not null references public.profiles(id) on delete cascade,
  buyer_id uuid not null references public.profiles(id) on delete cascade,
  proposed_by uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  price integer not null check (price between 0 and 100000000),
  meet_at timestamptz,
  meet_place text not null default '' check (char_length(meet_place) <= 60),
  status text not null default 'proposed' check (status in ('proposed', 'accepted', 'completed', 'canceled', 'declined')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- 한 대화방에 진행 중인 약속은 하나, 한 물건에 수락된 약속도 하나
create unique index if not exists deals_one_open_per_room on public.deals (room_id) where status in ('proposed', 'accepted');
create unique index if not exists deals_one_accepted_per_item on public.deals (item_id) where status = 'accepted';
create index if not exists deals_item_idx on public.deals (item_id);
create index if not exists deals_seller_idx on public.deals (seller_id);
create index if not exists deals_buyer_idx on public.deals (buyer_id);
create index if not exists deals_proposer_idx on public.deals (proposed_by);

alter table public.deals enable row level security;
create policy "deals_select_member" on public.deals
  for select to authenticated using ((select auth.uid()) in (seller_id, buyer_id));
-- 제안: 방의 두 사람 중 한 명이, 판매중인 물건에만, 방 정보와 똑같이
create policy "deals_insert_member" on public.deals
  for insert to authenticated
  with check (
    (select auth.uid()) = proposed_by
    and (select auth.uid()) in (seller_id, buyer_id)
    and exists (
      select 1 from public.chat_rooms r join public.items i on i.id = r.item_id
      -- 주의: 안쪽 질문에서 'item_id'처럼만 쓰면 chat_rooms의 칸으로 읽혀서 항상 참이 돼요. 그래서 deals.를 붙여요.
      where r.id = deals.room_id and r.item_id = deals.item_id
        and r.seller_id = deals.seller_id and r.buyer_id = deals.buyer_id
        and i.status = '판매중'
        and not goguma_private.is_blocked(r.seller_id, r.buyer_id)
    )
  );
create policy "deals_update_member" on public.deals
  for update to authenticated
  using ((select auth.uid()) in (seller_id, buyer_id))
  with check ((select auth.uid()) in (seller_id, buyer_id));
revoke update on public.deals from authenticated, anon;
grant update (status) on public.deals to authenticated;

-- 누가 어떤 단계로 바꿀 수 있는지 (사람이 누를 때만 검사, 트리거 안의 자동 정리는 통과)
create or replace function public.goguma_deal_guard()
returns trigger language plpgsql set search_path = '' as $$
declare me uuid := auth.uid();
begin
  new.updated_at = now();
  if goguma_private.is_internal() then return new; end if;
  if (new.price, new.meet_at, new.meet_place, new.item_id, new.room_id, new.seller_id, new.buyer_id, new.proposed_by)
     is distinct from (old.price, old.meet_at, old.meet_place, old.item_id, old.room_id, old.seller_id, old.buyer_id, old.proposed_by) then
    raise exception 'deal_locked' using errcode = 'P0001';
  end if;
  if old.status = 'proposed' and new.status = 'accepted' and me <> old.proposed_by then
    if not exists (select 1 from public.items i where i.id = old.item_id and i.status = '판매중') then
      raise exception 'item_not_available' using errcode = 'P0001';
    end if;
    return new;
  elsif old.status = 'proposed' and new.status = 'declined' and me <> old.proposed_by then return new;
  elsif old.status = 'proposed' and new.status = 'canceled' and me = old.proposed_by then return new;
  elsif old.status = 'accepted' and new.status = 'completed' and me = old.seller_id then return new;
  elsif old.status = 'accepted' and new.status = 'canceled' then return new;
  end if;
  raise exception 'bad_deal_step' using errcode = 'P0001';
end;
$$;
revoke execute on function public.goguma_deal_guard() from public, anon, authenticated;
drop trigger if exists goguma_deal_guard on public.deals;
create trigger goguma_deal_guard before update on public.deals for each row execute function public.goguma_deal_guard();

-- 약속 단계가 바뀌면: 물건 상태를 맞추고, 대화방에 안내 메시지를 남겨요.
create or replace function public.goguma_deal_effects()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := coalesce(auth.uid(), new.proposed_by);
  who text;
  info text;
  msg text;
begin
  select nickname into who from public.profiles where id = actor;
  info := to_char(new.price, 'FM999,999,999') || '원'
       || case when new.meet_at is not null then ' · ' || to_char(new.meet_at at time zone 'Asia/Seoul', 'MM/DD HH24:MI') else '' end
       || case when new.meet_place <> '' then ' · ' || new.meet_place else '' end;

  perform set_config('goguma.internal', '1', true);
  if tg_op = 'INSERT' then
    msg := '🤝 ' || coalesce(who, '') || '님이 거래 약속을 제안했어요: ' || info;
  elsif new.status = 'accepted' and old.status = 'proposed' then
    update public.items set status = '예약중', buyer_id = new.buyer_id where id = new.item_id;
    -- 같은 물건의 다른 대화방 제안은 자동으로 거절돼요.
    update public.deals set status = 'declined' where item_id = new.item_id and id <> new.id and status = 'proposed';
    msg := '✅ 거래 약속이 잡혔어요! (' || info || ') 물건이 예약중으로 바뀌었어요.';
  elsif new.status = 'completed' and old.status = 'accepted' then
    update public.items set status = '거래완료', buyer_id = new.buyer_id where id = new.item_id;
    msg := '🎉 거래가 완료됐어요! 서로 거래 후기를 남겨 주세요.';
  elsif new.status = 'canceled' and old.status = 'accepted' then
    update public.items set status = '판매중' where id = new.item_id and status = '예약중' and buyer_id = new.buyer_id;
    msg := '↩️ ' || coalesce(who, '') || '님이 거래 약속을 취소했어요. 물건이 다시 판매중이 됐어요.';
  elsif new.status = 'canceled' then
    msg := '↩️ ' || coalesce(who, '') || '님이 거래 제안을 철회했어요.';
  elsif new.status = 'declined' then
    msg := '🙅 거래 제안이 거절됐어요.';
  end if;

  if msg is not null then
    insert into public.chat_messages (room_id, sender_id, body, kind) values (new.room_id, actor, msg, 'system');
  end if;
  perform set_config('goguma.internal', '', true);
  return null;
end;
$$;
revoke execute on function public.goguma_deal_effects() from public, anon, authenticated;
drop trigger if exists goguma_deal_effects on public.deals;
create trigger goguma_deal_effects after insert or update on public.deals for each row execute function public.goguma_deal_effects();

-- 판매자가 상태를 직접 바꾸면(수정 화면·거래완료 버튼) 진행 중인 약속도 정리해요.
create or replace function public.goguma_item_deal_sync()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if goguma_private.is_internal() or new.status is not distinct from old.status then return null; end if;
  perform set_config('goguma.internal', '1', true);
  if new.status = '판매중' then
    update public.deals set status = 'canceled' where item_id = new.id and status = 'accepted';
  elsif new.status = '거래완료' then
    update public.deals
      set status = case when buyer_id = new.buyer_id and status = 'accepted' then 'completed' else 'canceled' end
      where item_id = new.id and status in ('proposed', 'accepted');
  end if;
  perform set_config('goguma.internal', '', true);
  return null;
end;
$$;
revoke execute on function public.goguma_item_deal_sync() from public, anon, authenticated;
drop trigger if exists goguma_item_deal_sync on public.items;
create trigger goguma_item_deal_sync after update on public.items for each row execute function public.goguma_item_deal_sync();

alter publication supabase_realtime add table public.deals;

-- ═════════════════════════════════════════════
-- 6) 알림 종류 추가: 답글, 가격 내림
-- ═════════════════════════════════════════════
alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in ('comment', 'like', 'review', 'sold', 'post_comment', 'keyword', 'report', 'reply', 'price_drop'));

create or replace function public.goguma_notify()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_seller uuid; v_author uuid; v_parent uuid;
begin
  if tg_table_name = 'item_comments' then
    select seller_id into v_seller from public.items where id = new.item_id;
    if new.parent_id is not null then
      -- 답글: 원댓글 쓴 사람에게
      select author_id into v_parent from public.item_comments where id = new.parent_id;
      if v_parent is not null and v_parent <> new.author_id then
        insert into public.notifications (user_id, actor_id, type, item_id, body)
        values (v_parent, new.author_id, 'reply', new.item_id, left(new.body, 80));
      end if;
    end if;
    if v_seller is not null and v_seller <> new.author_id and v_seller is distinct from v_parent then
      insert into public.notifications (user_id, actor_id, type, item_id, body)
      values (v_seller, new.author_id, 'comment', new.item_id, left(new.body, 80));
    end if;
  elsif tg_table_name = 'item_likes' then
    select seller_id into v_seller from public.items where id = new.item_id;
    if v_seller is not null and v_seller <> new.user_id then
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
    -- 가격이 내려가면 ♡ 누른 사람들에게
    if new.price < old.price and new.status <> '거래완료' then
      insert into public.notifications (user_id, actor_id, type, item_id, body)
      select l.user_id, new.seller_id, 'price_drop', new.id,
             to_char(old.price, 'FM999,999,999') || '원 → ' || to_char(new.price, 'FM999,999,999') || '원'
      from public.item_likes l where l.item_id = new.id and l.user_id <> new.seller_id;
    end if;
  elsif tg_table_name = 'community_comments' then
    select author_id into v_author from public.community_posts where id = new.post_id;
    if new.parent_id is not null then
      select author_id into v_parent from public.community_comments where id = new.parent_id;
      if v_parent is not null and v_parent <> new.author_id then
        insert into public.notifications (user_id, actor_id, type, post_id, body)
        values (v_parent, new.author_id, 'reply', new.post_id, left(new.body, 80));
      end if;
    end if;
    if v_author is not null and v_author <> new.author_id and v_author is distinct from v_parent then
      insert into public.notifications (user_id, actor_id, type, post_id, body)
      values (v_author, new.author_id, 'post_comment', new.post_id, left(new.body, 80));
    end if;
  end if;
  return null;
end;
$$;

-- ═════════════════════════════════════════════
-- 7) 도배 방지는 사람이 보낸 메시지만 세요. (자동 안내 메시지는 빼요)
-- ═════════════════════════════════════════════
create or replace function public.goguma_rate_limit()
returns trigger language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  if tg_table_name = 'chat_messages' then
    if new.kind = 'system' then return new; end if;
    select count(*) into n from public.chat_messages
      where sender_id = new.sender_id and kind = 'text' and created_at > now() - interval '1 minute';
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
