-- 고구마마켓: 독립 검토(코드 리뷰)에서 나온 문제 고치기

-- ① 판매자가 고칠 수 있는 칸을 정해요. (숨김·조회수·좋아요 수·작성 시각 등은 직접 못 바꿔요)
--    숨김(is_hidden)은 운영자만 바꿀 수 있게 아래 트리거가 한 번 더 막아요.
revoke update on public.items from authenticated, anon;
grant update (title, description, price, category, status, photos, accept_offers, condition, trade_method, buyer_id, bumped_at, is_hidden)
  on public.items to authenticated;

create or replace function public.items_guard_admin_cols()
returns trigger language plpgsql set search_path = '' as $$
begin
  if goguma_private.is_internal() then return new; end if;
  if new.is_hidden is distinct from old.is_hidden
     and not exists (select 1 from public.goguma_admins a where a.user_id = auth.uid()) then
    raise exception 'admin_only' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
revoke execute on function public.items_guard_admin_cols() from public, anon, authenticated;
drop trigger if exists items_guard_admin_cols on public.items;
create trigger items_guard_admin_cols before update on public.items for each row execute function public.items_guard_admin_cols();

-- ② 거래 약속 안내 메시지의 '보낸 사람': 그 방의 두 사람 중 한 명이어야 해요.
--    (다른 방에서 자동 거절될 때 엉뚱한 사람 이름으로 남던 문제)
-- ③ 수락·제안할 때 물건 줄을 잠가서(for update) 동시에 일어나도 꼬이지 않게
create or replace function public.goguma_deal_effects()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := case when auth.uid() in (new.seller_id, new.buyer_id) then auth.uid() else new.seller_id end;
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
    update public.deals set status = 'declined' where item_id = new.item_id and id <> new.id and status = 'proposed';
    msg := '✅ 거래 약속이 잡혔어요! (' || info || ') 물건이 예약중으로 바뀌었어요.';
  elsif new.status = 'completed' and old.status = 'accepted' then
    update public.items set status = '거래완료', buyer_id = new.buyer_id where id = new.item_id;
    msg := '🎉 거래가 완료됐어요! 서로 거래 후기를 남겨 주세요.';
  elsif new.status = 'canceled' and old.status = 'accepted' then
    update public.items set status = '판매중' where id = new.item_id and status = '예약중' and buyer_id = new.buyer_id;
    msg := '↩️ ' || coalesce(who, '') || '님이 거래 약속을 취소했어요. 물건이 다시 판매중이 됐어요.';
  elsif new.status = 'canceled' and old.status = 'completed' then
    msg := '↩️ 판매자가 물건을 다시 판매중으로 바꿨어요.';
  elsif new.status = 'canceled' then
    msg := '↩️ 거래 제안이 철회됐어요.';
  elsif new.status = 'declined' then
    msg := '🙅 거래 제안이 거절됐어요. (물건이 다른 분과 예약됐거나 상대가 거절했어요)';
  end if;

  if msg is not null then
    insert into public.chat_messages (room_id, sender_id, body, kind) values (new.room_id, actor, msg, 'system');
  end if;
  perform set_config('goguma.internal', '', true);
  return null;
end;
$$;

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
    -- 물건 줄을 잠가서, 같은 순간 다른 수락·변경과 겹치지 않게
    perform 1 from public.items i where i.id = old.item_id and i.status = '판매중' for update;
    if not found then raise exception 'item_not_available' using errcode = 'P0001'; end if;
    return new;
  elsif old.status = 'proposed' and new.status = 'declined' and me <> old.proposed_by then return new;
  elsif old.status = 'proposed' and new.status = 'canceled' and me = old.proposed_by then return new;
  elsif old.status = 'accepted' and new.status = 'completed' and me = old.seller_id then return new;
  elsif old.status = 'accepted' and new.status = 'canceled' then return new;
  end if;
  raise exception 'bad_deal_step' using errcode = 'P0001';
end;
$$;

-- 새 제안도 물건 줄을 잠그고 '판매중'인지 다시 확인
create or replace function public.goguma_deal_insert_lock()
returns trigger language plpgsql set search_path = '' as $$
begin
  perform 1 from public.items i where i.id = new.item_id and i.status = '판매중' for update;
  if not found then raise exception 'item_not_available' using errcode = 'P0001'; end if;
  return new;
end;
$$;
revoke execute on function public.goguma_deal_insert_lock() from public, anon, authenticated;
drop trigger if exists goguma_deal_insert_lock on public.deals;
create trigger goguma_deal_insert_lock before insert on public.deals for each row execute function public.goguma_deal_insert_lock();

-- ④ 판매자가 상태를 직접 바꿀 때 약속 정리 (거래완료 → 판매중으로 되돌리면 완료된 약속도 정리)
create or replace function public.goguma_item_deal_sync()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if goguma_private.is_internal() or new.status is not distinct from old.status then return null; end if;
  perform set_config('goguma.internal', '1', true);
  if new.status = '판매중' then
    update public.deals set status = 'canceled' where item_id = new.id and status in ('accepted', 'completed');
  elsif new.status = '예약중' then
    -- 약속 없이 직접 예약중으로 바꾸면, 기다리던 제안들은 거절로 정리
    update public.deals set status = 'declined' where item_id = new.id and status = 'proposed';
  elsif new.status = '거래완료' then
    update public.deals
      set status = case when buyer_id = new.buyer_id and status = 'accepted' then 'completed' else 'canceled' end
      where item_id = new.id and status in ('proposed', 'accepted');
  end if;
  perform set_config('goguma.internal', '', true);
  return null;
end;
$$;

-- ⑤ 가격 내림 알림은 같은 물건에 하루 한 번만 (조금씩 여러 번 내려도 도배되지 않게)
create or replace function public.goguma_price_drop_notify()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.price < old.price and new.status <> '거래완료' then
    insert into public.notifications (user_id, actor_id, type, item_id, body)
    select l.user_id, new.seller_id, 'price_drop', new.id,
           to_char(old.price, 'FM999,999,999') || '원 → ' || to_char(new.price, 'FM999,999,999') || '원'
    from public.item_likes l
    where l.item_id = new.id and l.user_id <> new.seller_id
      and not exists (
        select 1 from public.notifications n
        where n.user_id = l.user_id and n.item_id = new.id and n.type = 'price_drop' and n.created_at > now() - interval '1 day'
      );
  end if;
  return null;
end;
$$;
revoke execute on function public.goguma_price_drop_notify() from public, anon, authenticated;
drop trigger if exists goguma_price_drop_notify on public.items;
create trigger goguma_price_drop_notify after update on public.items for each row execute function public.goguma_price_drop_notify();

-- goguma_notify의 items 부분에서는 가격 내림을 빼요(위 트리거가 담당)
create or replace function public.goguma_notify()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_seller uuid; v_author uuid; v_parent uuid;
begin
  if tg_table_name = 'item_comments' then
    select seller_id into v_seller from public.items where id = new.item_id;
    if new.parent_id is not null then
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
    if new.status = '거래완료' and new.buyer_id is not null
       and (old.status <> '거래완료' or new.buyer_id is distinct from old.buyer_id) then
      insert into public.notifications (user_id, actor_id, type, item_id)
      values (new.buyer_id, new.seller_id, 'sold', new.id);
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
