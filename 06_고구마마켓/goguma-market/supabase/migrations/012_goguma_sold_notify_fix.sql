-- 고구마마켓: '거래완료' 알림 고치기
-- 거래 약속으로 거래하면 '예약중' 때 이미 구매자가 정해져서, '구매자가 바뀔 때'만 알리던 조건으로는
-- 거래완료 알림이 가지 않았어요. → '거래완료로 바뀐 순간'에 알리도록 바꿔요.
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
