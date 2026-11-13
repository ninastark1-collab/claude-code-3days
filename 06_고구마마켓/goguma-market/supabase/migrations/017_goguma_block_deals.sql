-- 고구마마켓: 3차 검토 — 차단과 거래 약속이 얽힐 때

-- 1) '나를 차단한 기록'도 나에게는 보여요.
--    채팅방에서 상대가 나를 차단했는지 알아야, 보내기·약속 버튼을 미리 막을 수 있어요.
--    (누가 나를 차단했는지만 보이고, 남들끼리의 차단은 여전히 안 보여요)
drop policy if exists "user_blocks_select_against_me" on public.user_blocks;
create policy "user_blocks_select_against_me" on public.user_blocks
  for select to authenticated using ((select auth.uid()) = blocked_id);

-- 2) 차단하면: 안 읽은 메시지 정리 + 두 사람 사이의 진행 중인 약속 취소
--    (차단당한 사람이 예전에 받은 제안을 수락해서 물건을 예약중으로 묶던 문제)
create or replace function public.goguma_block_mark_read()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  -- 약속 취소를 먼저 해요. (취소 안내 메시지까지 아래에서 함께 읽음 처리되게)
  perform set_config('goguma.internal', '1', true);
  perform set_config('goguma.reason', 'blocked', true);
  update public.deals d set status = 'canceled'
    where d.status in ('proposed', 'accepted')
      and ((d.seller_id = new.blocker_id and d.buyer_id = new.blocked_id)
        or (d.seller_id = new.blocked_id and d.buyer_id = new.blocker_id));
  perform set_config('goguma.reason', '', true);
  perform set_config('goguma.internal', '', true);

  update public.chat_messages m set read_at = now()
    from public.chat_rooms r
    where m.room_id = r.id and m.read_at is null
      and ((r.seller_id = new.blocker_id and r.buyer_id = new.blocked_id)
        or (r.seller_id = new.blocked_id and r.buyer_id = new.blocker_id));
  return null;
end;
$$;

-- 3) 약속 단계 검사: 차단된 사이에서는 수락할 수 없어요 (한 번 더 막기)
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
  if new.status = 'accepted' and goguma_private.is_blocked(old.seller_id, old.buyer_id) then
    raise exception 'blocked_pair' using errcode = 'P0001';
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

-- 4) 안내 문구: 차단으로 취소된 경우
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
  elsif new.status = 'canceled' and reason in ('hidden', 'blocked') then
    update public.items set status = '판매중' where id = new.item_id and status = '예약중' and buyer_id = new.buyer_id;
    msg := case reason when 'hidden' then '🚫 운영자가 이 판매글을 숨겨서 거래 약속이 취소됐어요.'
                       else '🚫 차단된 사이가 되어 거래 약속이 취소됐어요.' end;
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
