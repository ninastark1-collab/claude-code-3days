-- 고구마마켓: 2차 검증 때 남겨 둔 한계 2가지 고치기

-- ═════════════════════════════════════════════
-- 1) 거래 약속 단계 바꾸기는 '물건 → 약속' 순서로 잠가요 (교착 상태 막기)
-- ═════════════════════════════════════════════
-- 교착 상태(deadlock): 두 사람이 서로 상대가 쥔 자물쇠를 기다리며 멈추는 것.
-- 예전엔 수락할 때 '약속 줄'을 먼저 잠그고 '물건 줄'을 나중에 잠갔어요.
-- 다른 방의 수락이 같은 순간 반대 순서로 잠그면, DB가 한쪽을 강제로 실패시켰어요.
-- 이제 약속 단계는 이 함수로만 바꾸고, 물건 줄을 '먼저' 잠가서 모두가 같은 순서로 기다려요.

-- 물건 줄 잠그기만 하는 도우미 (상태와 상관없이). API에 안 열린 goguma_private에 둬요.
create or replace function goguma_private.lock_item(p_item bigint)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform 1 from public.items where id = p_item for update;
end;
$$;
revoke all on function goguma_private.lock_item(bigint) from public, anon;
grant execute on function goguma_private.lock_item(bigint) to authenticated;

-- security invoker(부른 사람 권한으로 실행): 볼 수 있는 약속만, 기존 규칙(RLS·guard 트리거) 그대로 적용돼요.
create or replace function public.goguma_set_deal_status(p_deal bigint, p_status text)
returns void language plpgsql security invoker set search_path = '' as $$
declare v_item bigint;
begin
  select item_id into v_item from public.deals where id = p_deal;
  if v_item is null then raise exception 'bad_deal_step' using errcode = 'P0001'; end if;
  perform goguma_private.lock_item(v_item);
  update public.deals set status = p_status where id = p_deal;
  if not found then raise exception 'bad_deal_step' using errcode = 'P0001'; end if;
end;
$$;
revoke all on function public.goguma_set_deal_status(bigint, text) from public, anon;
grant execute on function public.goguma_set_deal_status(bigint, text) to authenticated;

-- ═════════════════════════════════════════════
-- 2) 운영자가 숨긴 글도 '그 물건을 산 사람'은 볼 수 있어요
-- ═════════════════════════════════════════════
-- 거래완료 뒤에 글이 숨겨지면, 구매자가 글을 못 봐서 후기를 남길 수 없었어요.
drop policy if exists "items_select_visible" on public.items;
create policy "items_select_visible" on public.items for select using (
  (not is_hidden)
  or (select auth.uid()) = seller_id
  or (select auth.uid()) = buyer_id
  or exists (select 1 from public.goguma_admins a where a.user_id = (select auth.uid()))
);
