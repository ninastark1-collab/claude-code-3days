-- 고구마마켓: 알림도 실시간으로
-- 새 알림이 생기면 위쪽 🔔의 빨간 숫자가 새로고침 없이 바로 올라가요. (RLS 덕분에 내 알림만 전달돼요)
alter publication supabase_realtime add table public.notifications;
