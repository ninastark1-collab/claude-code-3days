-- 고구마마켓: 키워드 10개 제한 고치기
-- 처음엔 '넣기 규칙(RLS)' 안에서 같은 표를 다시 세었더니, 규칙이 자기 자신을 계속 부르는
-- 무한 반복(infinite recursion) 오류가 났어요. 그래서 개수 제한은 트리거로 옮겨요.

drop policy if exists "keyword_alerts_insert_own" on public.keyword_alerts;
create policy "keyword_alerts_insert_own" on public.keyword_alerts
  for insert to authenticated with check ((select auth.uid()) = user_id);

create or replace function public.goguma_keyword_limit()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if (select count(*) from public.keyword_alerts where user_id = new.user_id) >= 10 then
    raise exception 'keyword_limit' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
revoke execute on function public.goguma_keyword_limit() from public, anon, authenticated;
drop trigger if exists goguma_keyword_limit on public.keyword_alerts;
create trigger goguma_keyword_limit before insert on public.keyword_alerts
  for each row execute function public.goguma_keyword_limit();
