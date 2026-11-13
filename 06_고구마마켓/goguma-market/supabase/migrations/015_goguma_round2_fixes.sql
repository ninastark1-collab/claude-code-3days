-- 고구마마켓: 2차 검토에서 나온 '실제로 쓰다 부딪히는 상황' 고치기
-- (거래 약속·후기·댓글·차단·탈퇴가 서로 얽힐 때 생기던 문제들)

-- ═════════════════════════════════════════════
-- 1) 후기: 판매글을 지워도 후기는 남겨요 + 같은 물건을 다른 사람에게 다시 팔면 그 사람에게도 후기 가능
-- ═════════════════════════════════════════════
-- 예전엔 글을 지우면 후기 글만 사라지고 온도는 그대로라, 나쁜 후기를 '지워 버리는' 구멍이 됐어요.
alter table public.item_reviews add column if not exists item_title text;
update public.item_reviews r set item_title = i.title from public.items i where i.id = r.item_id and r.item_title is null;
alter table public.item_reviews alter column item_id drop not null;
alter table public.item_reviews drop constraint if exists item_reviews_item_id_fkey;
alter table public.item_reviews add constraint item_reviews_item_id_fkey
  foreign key (item_id) references public.items(id) on delete set null;
-- 한 물건에 대해 '누가 → 누구에게' 한 번씩 (되팔린 물건의 새 구매자에게도 남길 수 있게)
alter table public.item_reviews drop constraint if exists item_reviews_item_id_reviewer_id_key;
alter table public.item_reviews drop constraint if exists item_reviews_item_reviewer_reviewee_key;
alter table public.item_reviews add constraint item_reviews_item_reviewer_reviewee_key unique (item_id, reviewer_id, reviewee_id);

-- 후기를 남길 때 물건 제목을 같이 적어 둬요. (글이 지워져도 "어떤 물건 후기"인지 보이게)
create or replace function public.goguma_review_snapshot()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  select title into new.item_title from public.items where id = new.item_id;
  return new;
end;
$$;
revoke execute on function public.goguma_review_snapshot() from public, anon, authenticated;
drop trigger if exists goguma_review_snapshot on public.item_reviews;
create trigger goguma_review_snapshot before insert on public.item_reviews for each row execute function public.goguma_review_snapshot();

-- 후기가 지워지면(남긴 사람이 탈퇴 등) 그 후기로 바뀐 온도도 되돌려요. (보이는 후기와 온도가 늘 맞게)
create or replace function public.goguma_review_temp_undo()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.profiles
    set manner_temp = least(99, greatest(0,
      manner_temp - case old.rating when 'good' then 0.5 when 'bad' then -1.0 else 0.1 end))
    where id = old.reviewee_id;
  return null;
end;
$$;
revoke execute on function public.goguma_review_temp_undo() from public, anon, authenticated;
drop trigger if exists goguma_review_temp_undo on public.item_reviews;
create trigger goguma_review_temp_undo after delete on public.item_reviews for each row execute function public.goguma_review_temp_undo();

-- ═════════════════════════════════════════════
-- 2) 댓글: 답글이 달린 원댓글을 지우면 '삭제된 댓글이에요'로만 남겨요 (남의 답글까지 사라지지 않게)
-- ═════════════════════════════════════════════
alter table public.item_comments add column if not exists is_deleted boolean not null default false;
alter table public.community_comments add column if not exists is_deleted boolean not null default false;

-- BEFORE DELETE 트리거: 답글이 있으면 진짜로 지우는 대신 내용만 비우고 return null(지우기 취소)해요.
-- 단, 글 자체나 글쓴이 계정이 지워져서 '줄줄이 지워지는 중'이면 그대로 지워요.
create or replace function public.goguma_comment_soft_delete()
returns trigger language plpgsql security definer set search_path = '' as $$
declare has_replies boolean; parent_alive boolean;
begin
  if old.parent_id is not null or old.is_deleted then return old; end if;
  if tg_table_name = 'item_comments' then
    select exists (select 1 from public.items where id = old.item_id)
       and exists (select 1 from public.profiles where id = old.author_id) into parent_alive;
    select exists (select 1 from public.item_comments where parent_id = old.id) into has_replies;
    if parent_alive and has_replies then
      update public.item_comments set is_deleted = true, body = '삭제된 댓글이에요' where id = old.id;
      return null;
    end if;
  else
    select exists (select 1 from public.community_posts where id = old.post_id)
       and exists (select 1 from public.profiles where id = old.author_id) into parent_alive;
    select exists (select 1 from public.community_comments where parent_id = old.id) into has_replies;
    if parent_alive and has_replies then
      update public.community_comments set is_deleted = true, body = '삭제된 댓글이에요' where id = old.id;
      update public.community_posts set comment_count = greatest(comment_count - 1, 0) where id = old.post_id;
      return null;
    end if;
  end if;
  return old;
end;
$$;
revoke execute on function public.goguma_comment_soft_delete() from public, anon, authenticated;
drop trigger if exists goguma_comment_soft_delete on public.item_comments;
create trigger goguma_comment_soft_delete before delete on public.item_comments for each row execute function public.goguma_comment_soft_delete();
drop trigger if exists goguma_comment_soft_delete on public.community_comments;
create trigger goguma_comment_soft_delete before delete on public.community_comments for each row execute function public.goguma_comment_soft_delete();

-- 마지막 답글까지 지워지면, 남아 있던 '삭제된 원댓글' 자리도 정리해요.
create or replace function public.goguma_comment_cleanup()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if old.parent_id is null then return null; end if;
  if tg_table_name = 'item_comments' then
    delete from public.item_comments p
      where p.id = old.parent_id and p.is_deleted
        and not exists (select 1 from public.item_comments c where c.parent_id = p.id);
  else
    delete from public.community_comments p
      where p.id = old.parent_id and p.is_deleted
        and not exists (select 1 from public.community_comments c where c.parent_id = p.id);
  end if;
  return null;
end;
$$;
revoke execute on function public.goguma_comment_cleanup() from public, anon, authenticated;
drop trigger if exists goguma_comment_cleanup on public.item_comments;
create trigger goguma_comment_cleanup after delete on public.item_comments for each row execute function public.goguma_comment_cleanup();
drop trigger if exists goguma_comment_cleanup on public.community_comments;
create trigger goguma_comment_cleanup after delete on public.community_comments for each row execute function public.goguma_comment_cleanup();

-- 동네생활 댓글 수: '삭제된 댓글' 자리는 이미 위에서 빼 줬으니 진짜 지울 때 또 빼지 않아요.
create or replace function public.goguma_post_comment_count()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    update public.community_posts set comment_count = comment_count + 1 where id = new.post_id;
  elsif not old.is_deleted then
    update public.community_posts set comment_count = greatest(comment_count - 1, 0) where id = old.post_id;
  end if;
  return null;
end;
$$;

-- 답글 검사: 삭제된 원댓글에는 답글 금지 + 나를 차단한(또는 내가 차단한) 판매자·글쓴이 글엔 댓글 금지
create or replace function public.goguma_reply_guard()
returns trigger language plpgsql set search_path = '' as $$
declare ok boolean := true; owner uuid;
begin
  if tg_table_name = 'item_comments' then
    select seller_id into owner from public.items where id = new.item_id;
    if new.parent_id is not null then
      select exists (select 1 from public.item_comments p where p.id = new.parent_id and p.item_id = new.item_id
                     and p.parent_id is null and not p.is_deleted) into ok;
    end if;
  else
    select author_id into owner from public.community_posts where id = new.post_id;
    if new.parent_id is not null then
      select exists (select 1 from public.community_comments p where p.id = new.parent_id and p.post_id = new.post_id
                     and p.parent_id is null and not p.is_deleted) into ok;
    end if;
  end if;
  if not ok then raise exception 'bad_parent' using errcode = 'P0001'; end if;
  if owner is not null and goguma_private.is_blocked(owner, new.author_id) then
    raise exception 'blocked_pair' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

-- ═════════════════════════════════════════════
-- 3) 알림: 차단한 사이에는 알림을 보내지 않아요
-- ═════════════════════════════════════════════
create or replace function public.goguma_notify()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_seller uuid; v_author uuid; v_parent uuid;
begin
  if tg_table_name = 'item_comments' then
    select seller_id into v_seller from public.items where id = new.item_id;
    if new.parent_id is not null then
      select author_id into v_parent from public.item_comments where id = new.parent_id;
      if v_parent is not null and v_parent <> new.author_id and not goguma_private.is_blocked(v_parent, new.author_id) then
        insert into public.notifications (user_id, actor_id, type, item_id, body)
        values (v_parent, new.author_id, 'reply', new.item_id, left(new.body, 80));
      end if;
    end if;
    if v_seller is not null and v_seller <> new.author_id and v_seller is distinct from v_parent
       and not goguma_private.is_blocked(v_seller, new.author_id) then
      insert into public.notifications (user_id, actor_id, type, item_id, body)
      values (v_seller, new.author_id, 'comment', new.item_id, left(new.body, 80));
    end if;
  elsif tg_table_name = 'item_likes' then
    select seller_id into v_seller from public.items where id = new.item_id;
    if v_seller is not null and v_seller <> new.user_id and not goguma_private.is_blocked(v_seller, new.user_id) then
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
      if v_parent is not null and v_parent <> new.author_id and not goguma_private.is_blocked(v_parent, new.author_id) then
        insert into public.notifications (user_id, actor_id, type, post_id, body)
        values (v_parent, new.author_id, 'reply', new.post_id, left(new.body, 80));
      end if;
    end if;
    if v_author is not null and v_author <> new.author_id and v_author is distinct from v_parent
       and not goguma_private.is_blocked(v_author, new.author_id) then
      insert into public.notifications (user_id, actor_id, type, post_id, body)
      values (v_author, new.author_id, 'post_comment', new.post_id, left(new.body, 80));
    end if;
  end if;
  return null;
end;
$$;

create or replace function public.goguma_price_drop_notify()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.price < old.price and new.status <> '거래완료' and not new.is_hidden then
    insert into public.notifications (user_id, actor_id, type, item_id, body)
    select l.user_id, new.seller_id, 'price_drop', new.id,
           to_char(old.price, 'FM999,999,999') || '원 → ' || to_char(new.price, 'FM999,999,999') || '원'
    from public.item_likes l
    where l.item_id = new.id and l.user_id <> new.seller_id
      and not goguma_private.is_blocked(l.user_id, new.seller_id)
      and not exists (
        select 1 from public.notifications n
        where n.user_id = l.user_id and n.item_id = new.id and n.type = 'price_drop' and n.created_at > now() - interval '1 day'
      );
  end if;
  return null;
end;
$$;

-- 차단하면 그 사람과의 대화방에 남은 '안 읽은 메시지'를 양쪽 모두 읽음으로 정리해요.
-- (대화방은 목록에서 사라지는데 채팅 숫자 배지만 영원히 남던 문제)
create or replace function public.goguma_block_mark_read()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.chat_messages m set read_at = now()
    from public.chat_rooms r
    where m.room_id = r.id and m.read_at is null
      and ((r.seller_id = new.blocker_id and r.buyer_id = new.blocked_id)
        or (r.seller_id = new.blocked_id and r.buyer_id = new.blocker_id));
  return null;
end;
$$;
revoke execute on function public.goguma_block_mark_read() from public, anon, authenticated;
drop trigger if exists goguma_block_mark_read on public.user_blocks;
create trigger goguma_block_mark_read after insert on public.user_blocks for each row execute function public.goguma_block_mark_read();

-- ═════════════════════════════════════════════
-- 4) 거래 약속: 상황에 맞는 안내 문구 + 숨김 처리 시 약속 정리
-- ═════════════════════════════════════════════
-- goguma.reason: 판매자가 상태를 바꾸거나(status) 운영자가 숨겨서(hidden) 약속이 정리될 때 표시
create or replace function public.goguma_deal_effects()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := case when auth.uid() in (new.seller_id, new.buyer_id) then auth.uid() else new.seller_id end;
  reason text := coalesce(current_setting('goguma.reason', true), '');
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
  elsif new.status = 'canceled' and reason = 'hidden' then
    update public.items set status = '판매중' where id = new.item_id and status = '예약중' and buyer_id = new.buyer_id;
    msg := '🚫 운영자가 이 판매글을 숨겨서 거래 약속이 취소됐어요.';
  elsif new.status = 'canceled' and reason = 'status' and old.status in ('proposed', 'accepted') then
    msg := '↩️ 판매자가 판매 상태를 바꿔서 이 거래 약속은 취소됐어요.';
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

-- 판매자가 상태를 직접 바꾸거나, 운영자가 글을 숨길 때 약속 정리
create or replace function public.goguma_item_deal_sync()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if goguma_private.is_internal() then return null; end if;

  -- 운영자가 숨기면: 진행 중인 약속을 모두 취소 (구매자가 볼 수 없는 글에 묶이지 않게)
  if new.is_hidden and not old.is_hidden then
    perform set_config('goguma.internal', '1', true);
    perform set_config('goguma.reason', 'hidden', true);
    update public.deals set status = 'canceled' where item_id = new.id and status in ('proposed', 'accepted');
    perform set_config('goguma.reason', '', true);
    perform set_config('goguma.internal', '', true);
    return null;
  end if;

  if new.status is not distinct from old.status then return null; end if;
  perform set_config('goguma.internal', '1', true);
  perform set_config('goguma.reason', 'status', true);
  if new.status = '판매중' then
    update public.deals set status = 'canceled' where item_id = new.id and status in ('accepted', 'completed');
  elsif new.status = '예약중' then
    update public.deals set status = 'declined' where item_id = new.id and status = 'proposed';
  elsif new.status = '거래완료' then
    update public.deals
      set status = case when buyer_id = new.buyer_id and status = 'accepted' then 'completed' else 'canceled' end
      where item_id = new.id and status in ('proposed', 'accepted');
  end if;
  perform set_config('goguma.reason', '', true);
  perform set_config('goguma.internal', '', true);
  return null;
end;
$$;

-- ═════════════════════════════════════════════
-- 5) 탈퇴: 내가 구매자로 잡혀 있던 약속을 먼저 취소해서 물건이 '예약중'에 갇히지 않게
-- ═════════════════════════════════════════════
create or replace function public.delete_my_goguma_account()
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then
    raise exception 'not_logged_in' using errcode = 'P0001';
  end if;
  update public.deals set status = 'canceled' where buyer_id = auth.uid() and status = 'accepted';
  delete from auth.users where id = auth.uid();
end;
$$;
revoke all on function public.delete_my_goguma_account() from public, anon;
grant execute on function public.delete_my_goguma_account() to authenticated;

-- ═════════════════════════════════════════════
-- 6) 성능: 채팅 메시지의 '보낸 사람'에 색인(찾아보기)을 달아요 (보안 점검 안내)
-- ═════════════════════════════════════════════
create index if not exists chat_messages_sender_idx on public.chat_messages (sender_id);
