-- 앱을 그냥 닫아서 남은 방을 정리: 12시간 동안 아무 변화 없는 방은 매시간 삭제
create extension if not exists pg_cron;
select cron.schedule(
  'poker-cleanup-old-rooms',
  '17 * * * *',
  $$ delete from public.poker_rooms where updated_at < now() - interval '12 hours' $$
);
