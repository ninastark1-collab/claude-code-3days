-- 고구마마켓 7단계: 운영자(신고 처리·글 숨김), 키워드 알림, 위치 기반 동네 인증
-- 가계부 테이블(transactions, budgets)은 건드리지 않아요.

-- ═════════════════════════════════════════════
-- 1) 운영자 목록
--    운영자 추가/제거는 Supabase 대시보드(SQL)에서만 해요. (앱에서 스스로 운영자가 될 수 없게)
-- ═════════════════════════════════════════════
create table if not exists public.goguma_admins (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.goguma_admins enable row level security;
-- 내가 운영자인지만 확인할 수 있어요. (넣기·빼기 정책이 없어서 앱에서는 못 바꿔요)
create policy "goguma_admins_select_self" on public.goguma_admins
  for select to authenticated using ((select auth.uid()) = user_id);

-- 첫 운영자: 고구마대장 (사장님이 고른 계정)
insert into public.goguma_admins (user_id)
select id from public.profiles where nickname = '고구마대장'
on conflict do nothing;

-- ═════════════════════════════════════════════
-- 2) 판매글 숨기기 (운영자가 신고된 글을 가려요)
--    숨긴 글은 판매자 본인과 운영자에게만 보여요.
-- ═════════════════════════════════════════════
alter table public.items add column if not exists is_hidden boolean not null default false;

drop policy if exists "items_select_all" on public.items;
create policy "items_select_visible" on public.items
  for select using (
    not is_hidden
    or (select auth.uid()) = seller_id
    or exists (select 1 from public.goguma_admins a where a.user_id = (select auth.uid()))
  );

create policy "items_admin_update" on public.items
  for update to authenticated
  using (exists (select 1 from public.goguma_admins a where a.user_id = (select auth.uid())))
  with check (exists (select 1 from public.goguma_admins a where a.user_id = (select auth.uid())));

-- 운영자는 문제 댓글·동네생활 글/댓글을 지울 수 있어요.
create policy "item_comments_admin_delete" on public.item_comments
  for delete to authenticated
  using (exists (select 1 from public.goguma_admins a where a.user_id = (select auth.uid())));
create policy "community_posts_admin_delete" on public.community_posts
  for delete to authenticated
  using (exists (select 1 from public.goguma_admins a where a.user_id = (select auth.uid())));
create policy "community_comments_admin_delete" on public.community_comments
  for delete to authenticated
  using (exists (select 1 from public.goguma_admins a where a.user_id = (select auth.uid())));

-- ═════════════════════════════════════════════
-- 3) 신고 처리 상태 (접수 → 처리완료 / 반려)
-- ═════════════════════════════════════════════
alter table public.reports
  add column if not exists status text not null default '접수' check (status in ('접수', '처리완료', '반려')),
  add column if not exists admin_note text not null default '' check (char_length(admin_note) <= 300),
  add column if not exists handled_at timestamptz,
  add column if not exists handled_by uuid references public.profiles(id) on delete set null;
create index if not exists reports_status_idx on public.reports (status, created_at desc);

create policy "reports_admin_select" on public.reports
  for select to authenticated
  using (exists (select 1 from public.goguma_admins a where a.user_id = (select auth.uid())));
create policy "reports_admin_update" on public.reports
  for update to authenticated
  using (exists (select 1 from public.goguma_admins a where a.user_id = (select auth.uid())))
  with check (exists (select 1 from public.goguma_admins a where a.user_id = (select auth.uid())));
revoke update on public.reports from authenticated, anon;
grant update (status, admin_note, handled_at, handled_by) on public.reports to authenticated;

-- ═════════════════════════════════════════════
-- 4) 키워드 알림: 관심 단어가 들어간 새 판매글이 올라오면 알려 줘요. (한 사람 10개까지)
-- ═════════════════════════════════════════════
create table if not exists public.keyword_alerts (
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  keyword text not null check (char_length(btrim(keyword)) between 1 and 20),
  created_at timestamptz not null default now(),
  primary key (user_id, keyword)
);
alter table public.keyword_alerts enable row level security;
create policy "keyword_alerts_select_own" on public.keyword_alerts
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "keyword_alerts_insert_own" on public.keyword_alerts
  for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    -- (10개 제한은 010 마이그레이션의 트리거로 옮겼어요)
  );
create policy "keyword_alerts_delete_own" on public.keyword_alerts
  for delete to authenticated using ((select auth.uid()) = user_id);

-- 알림 종류에 '키워드', '신고 처리 결과' 추가
alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in ('comment', 'like', 'review', 'sold', 'post_comment', 'keyword', 'report'));

-- 새 판매글 → 키워드가 제목에 들어 있는 사람에게 알림 (판매자 본인, 차단한 사이는 빼요)
create or replace function public.goguma_keyword_notify()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.notifications (user_id, actor_id, type, item_id, body)
  select distinct on (k.user_id) k.user_id, new.seller_id, 'keyword', new.id, k.keyword
  from public.keyword_alerts k
  where k.user_id <> new.seller_id
    and position(lower(k.keyword) in lower(new.title)) > 0
    and not goguma_private.is_blocked(k.user_id, new.seller_id)
  order by k.user_id, k.keyword;
  return null;
end;
$$;
revoke execute on function public.goguma_keyword_notify() from public, anon, authenticated;
drop trigger if exists goguma_keyword_notify on public.items;
create trigger goguma_keyword_notify after insert on public.items
  for each row execute function public.goguma_keyword_notify();

-- 신고가 처리되면 신고한 사람에게 결과 알림
create or replace function public.goguma_report_notify()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status <> '접수' and new.status is distinct from old.status then
    insert into public.notifications (user_id, actor_id, type, body)
    values (new.reporter_id, new.handled_by, 'report', new.status || case when new.admin_note <> '' then ' — ' || new.admin_note else '' end);
  end if;
  return null;
end;
$$;
revoke execute on function public.goguma_report_notify() from public, anon, authenticated;
drop trigger if exists goguma_report_notify on public.reports;
create trigger goguma_report_notify after update on public.reports
  for each row execute function public.goguma_report_notify();

-- ═════════════════════════════════════════════
-- 5) 동네 인증: 휴대폰 위치로 확인한 동네면 인증 시각을 남겨요.
--    동네 이름을 손으로 바꾸면 인증 표시는 자동으로 사라져요.
-- ═════════════════════════════════════════════
alter table public.profiles add column if not exists region_verified_at timestamptz;
grant update (region_verified_at) on public.profiles to authenticated;

create or replace function public.profiles_guard_region()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.region_verified_at is distinct from old.region_verified_at then
    -- 인증 시각은 '지금'으로만 적을 수 있어요(미래·과거로 조작 방지). 지우는 건 가능.
    if new.region_verified_at is not null then
      new.region_verified_at = now();
    end if;
  elsif new.region is distinct from old.region then
    -- 인증 없이 동네만 바꾸면 인증 표시를 지워요.
    new.region_verified_at = null;
  end if;
  return new;
end;
$$;
revoke execute on function public.profiles_guard_region() from public, anon, authenticated;
drop trigger if exists profiles_guard_region on public.profiles;
create trigger profiles_guard_region before update on public.profiles
  for each row execute function public.profiles_guard_region();
