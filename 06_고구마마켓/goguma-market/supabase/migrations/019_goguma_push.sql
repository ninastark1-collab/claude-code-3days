-- 고구마마켓: 푸시 알림 (사이트를 닫아도 휴대폰·컴퓨터로 알림)
-- 흐름: 새 채팅 메시지·새 알림이 생김 → 이 DB 트리거가 Edge Function(goguma-push)을 부름
--       → 함수가 받는 사람 기기들로 웹 푸시를 보냄.
-- ※ 비밀 값(VAPID 비밀 열쇠, 트리거↔함수 암호)은 이 파일에 없어요. Supabase 금고(Vault)에만 있어요:
--    vault 이름 'goguma_vapid_private', 'goguma_push_hook'

-- pg_net: DB 안에서 다른 서버로 HTTP 요청을 보내는 확장 기능 (요청은 트랜잭션이 끝난 뒤 뒤에서 보내져요)
-- (보안 점검 권장대로 public이 아닌 extensions 영역에 설치)
create extension if not exists pg_net with schema extensions;

-- 1) 알림 받을 기기(구독) 목록. 한 사람이 여러 기기를 쓸 수 있어요.
create table if not exists public.push_subscriptions (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  endpoint text not null check (endpoint ~ '^https://' and char_length(endpoint) <= 1000),
  p256dh text not null check (char_length(p256dh) <= 200),
  auth text not null check (char_length(auth) <= 100),
  created_at timestamptz not null default now(),
  unique (user_id, endpoint)
);
alter table public.push_subscriptions enable row level security;
create policy "push_subscriptions_select_own" on public.push_subscriptions
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "push_subscriptions_insert_own" on public.push_subscriptions
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "push_subscriptions_delete_own" on public.push_subscriptions
  for delete to authenticated using ((select auth.uid()) = user_id);

-- 2) 이미 보낸 푸시 기록 (같은 메시지를 두 번 보내지 않게). 정책이 없어서 서버 함수(관리자 권한)만 써요.
create table if not exists public.push_sent (
  kind text not null check (kind in ('chat', 'noti')),
  ref_id bigint not null,
  sent_at timestamptz not null default now(),
  primary key (kind, ref_id)
);
alter table public.push_sent enable row level security;
comment on table public.push_sent is '보낸 푸시 기록. 정책 없음(의도): Edge Function(service_role)만 읽고 써요.';

-- 3) 서버 함수가 비밀 값을 꺼내는 통로: 서버 함수(service_role)만 부를 수 있어요.
create or replace function public.goguma_push_config()
returns json language sql stable security definer set search_path = '' as $$
  select json_build_object(
    'vapid_private', (select decrypted_secret from vault.decrypted_secrets where name = 'goguma_vapid_private'),
    'hook', (select decrypted_secret from vault.decrypted_secrets where name = 'goguma_push_hook')
  );
$$;
revoke all on function public.goguma_push_config() from public, anon, authenticated;
grant execute on function public.goguma_push_config() to service_role;

-- 4) 트리거: 받을 사람이 알림을 켜 둔 경우에만 서버 함수를 불러요.
create or replace function public.goguma_push_hook()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_to uuid; v_hook text;
begin
  if tg_table_name = 'chat_messages' then
    select case when r.seller_id = new.sender_id then r.buyer_id else r.seller_id end
      into v_to from public.chat_rooms r where r.id = new.room_id;
  else
    v_to := new.user_id;
  end if;
  if v_to is null or not exists (select 1 from public.push_subscriptions s where s.user_id = v_to) then
    return null;
  end if;
  select decrypted_secret into v_hook from vault.decrypted_secrets where name = 'goguma_push_hook';
  if v_hook is null then return null; end if;
  perform net.http_post(
    url := 'https://gfcylhusujdvzsoinwoj.supabase.co/functions/v1/goguma-push',
    body := jsonb_build_object('kind', case when tg_table_name = 'chat_messages' then 'chat' else 'noti' end, 'id', new.id),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-goguma-hook', v_hook)
  );
  return null;
end;
$$;
revoke execute on function public.goguma_push_hook() from public, anon, authenticated;
drop trigger if exists goguma_push_hook on public.chat_messages;
create trigger goguma_push_hook after insert on public.chat_messages for each row execute function public.goguma_push_hook();
drop trigger if exists goguma_push_hook on public.notifications;
create trigger goguma_push_hook after insert on public.notifications for each row execute function public.goguma_push_hook();
