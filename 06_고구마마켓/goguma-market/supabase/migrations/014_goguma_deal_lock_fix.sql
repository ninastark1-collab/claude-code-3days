-- 고구마마켓: 거래 약속 '물건 잠그기' 고치기
-- 013에서 넣은 'select ... for update'(물건 줄 잠그기)는 '고칠 권한이 있는 사람'만 쓸 수 있어서,
-- 판매자가 아닌 구매자가 제안·수락하면 물건을 못 찾은 것처럼 막혔어요.
-- → 잠그기만 하는 작은 함수를 관리자 권한(security definer)으로 만들어 둘이 같이 써요.

create or replace function goguma_private.lock_item_if_available(p_item bigint)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  perform 1 from public.items i where i.id = p_item and i.status = '판매중' for update;
  return found;
end;
$$;
revoke all on function goguma_private.lock_item_if_available(bigint) from public, anon;
grant execute on function goguma_private.lock_item_if_available(bigint) to authenticated;

create or replace function public.goguma_deal_insert_lock()
returns trigger language plpgsql set search_path = '' as $$
begin
  if not goguma_private.lock_item_if_available(new.item_id) then
    raise exception 'item_not_available' using errcode = 'P0001';
  end if;
  return new;
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
    if not goguma_private.lock_item_if_available(old.item_id) then
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
