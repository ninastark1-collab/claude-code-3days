-- 고구마마켓: 채팅 사진은 올린 사람이 지울 수 있게
-- (Storage 파일은 DB에서 직접 지울 수 없어서, 정리하려면 Storage API로 지울 권한이 필요해요)
-- owner_id: Storage가 파일을 올린 사람의 id를 자동으로 적어 두는 칸이에요.
create policy "goguma_chat_photos_delete_uploader" on storage.objects
  for delete to authenticated
  using (bucket_id = 'goguma-chat-photos' and owner_id = (select auth.uid())::text);
