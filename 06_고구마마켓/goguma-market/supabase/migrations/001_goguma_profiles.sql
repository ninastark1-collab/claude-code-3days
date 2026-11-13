-- 고구마마켓: 회원 프로필 테이블
-- 가계부(transactions, budgets)와 같은 DB를 쓰므로, 고구마마켓 테이블은 겹치지 않는 이름을 씁니다.

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nickname text not null check (char_length(nickname) between 2 and 12),
  region text,                                   -- 동네 (나중에 '내 동네' 기능에서 사용)
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- 프로필은 누구나 볼 수 있고(판매자 닉네임 표시용), 수정은 본인만 가능합니다.
create policy "profiles_select_all" on public.profiles
  for select using (true);

create policy "profiles_update_own" on public.profiles
  for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- 회원가입(auth.users 행 생성) 시 프로필을 자동으로 만들어 주는 트리거
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, nickname, region)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data ->> 'nickname', ''), '고구마' || substr(new.id::text, 1, 4)),
    new.raw_user_meta_data ->> 'region'
  );
  return new;
end;
$$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
