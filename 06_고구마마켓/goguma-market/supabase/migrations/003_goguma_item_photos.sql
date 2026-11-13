-- 고구마마켓: 판매글 사진 (최대 10장)
-- 사진 파일은 Supabase Storage(사진·파일 저장 공간)의 'goguma-item-photos' 버킷(폴더 묶음)에 두고,
-- items 테이블에는 파일 위치(경로) 목록만 순서대로 저장해요. 첫 번째 사진이 대표 사진이에요.

-- 1) items에 사진 경로 목록 칸 추가 (최대 10개)
alter table public.items
  add column if not exists photos text[] not null default '{}'
  constraint items_photos_max_10 check (cardinality(photos) <= 10);

-- 2) 사진 버킷: 누구나 사진 주소로 볼 수 있게 public, 한 장당 5MB까지, 이미지 파일만
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('goguma-item-photos', 'goguma-item-photos', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- 3) 사진 파일 권한(RLS): 로그인한 사람은 '내 아이디' 폴더 안에만 올리고 지울 수 있어요.
--    경로 모양: {내 사용자 id}/{파일이름}.jpg
--    (사진 보기는 public 주소로 하므로 따로 정책이 필요 없어요. select 정책은 '내 사진 지우기'에 필요해서 내 폴더만 열어 둬요.)
create policy "goguma_photos_insert_own" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'goguma-item-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "goguma_photos_select_own" on storage.objects
  for select to authenticated
  using (bucket_id = 'goguma-item-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "goguma_photos_delete_own" on storage.objects
  for delete to authenticated
  using (bucket_id = 'goguma-item-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
