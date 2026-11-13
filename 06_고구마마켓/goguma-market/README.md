# 🍠 고구마마켓

흙 털고 건네는 우리 동네 중고거래. Next.js + Supabase 로 단계별로 만들어 가는 공부용 프로젝트입니다.

## 실행

```bash
npm install
npm run dev     # http://localhost:3000
npm test        # 자동 테스트 (Vitest)
```

`.env.local` 에 Supabase 주소와 publishable 키가 들어 있습니다. (`.env.example` 참고)
가계부 앱과 **같은 Supabase 프로젝트**를 씁니다. 가계부 테이블(`transactions`, `budgets`)은 건드리지 않습니다.

## 1단계: 회원가입 / 로그인 / 로그아웃 ✅

| 파일 | 하는 일 |
| --- | --- |
| `src/lib/supabase/client.ts` | 브라우저용 Supabase 클라이언트 |
| `src/lib/supabase/server.ts` | 서버용 클라이언트 (쿠키로 세션 읽기) |
| `src/lib/supabase/proxy.ts` + `src/proxy.ts` | 요청마다 세션 갱신, `/my` 보호, 로그인한 사람은 `/login`·`/signup` 접근 시 홈으로 |
| `src/app/auth/actions.ts` | `signup`, `login`, `logout` Server Actions |
| `src/app/auth/callback/route.ts` | 이메일 인증 링크를 눌렀을 때 세션으로 바꿔 주는 곳 |
| `src/lib/auth.ts` | 현재 사용자 + 프로필(닉네임, 동네) 가져오기 |
| `src/app/(auth)/login`, `signup` | 로그인 / 회원가입 화면 |
| `src/app/my` | 로그인한 사람만 보는 내 정보 |
| `supabase/migrations/001_goguma_profiles.sql` | `profiles` 테이블 + 가입 시 자동 생성 트리거 + RLS |

### 흐름
1. 회원가입 폼 → `signup` 액션 → `supabase.auth.signUp({ options: { data: { nickname, region } } })`
2. DB 트리거 `on_auth_user_created` 가 `auth.users` 에 들어온 메타데이터로 `profiles` 행을 만듭니다.
3. 세션은 쿠키에 저장되고, `proxy.ts` 가 요청마다 토큰을 갱신합니다.
4. 로그아웃은 `<form action={logout}>` 버튼 하나로 처리됩니다.

> 현재 Supabase 프로젝트는 **이메일 인증이 꺼져 있어서** 가입 즉시 로그인됩니다.
> 대시보드 → Authentication → Sign In / Providers 에서 "Confirm email"을 켜면, 인증 메일 안내 화면과 `/auth/callback` 이 동작합니다.

### Next.js 16 메모
- `middleware.ts` 대신 `proxy.ts` 를 씁니다.
- Cache Components 가 켜져 있어서, 쿠키(로그인 정보)를 읽는 컴포넌트는 `<Suspense>` 안에 둬야 합니다.

## 2단계: 판매글 CRUD (사진 제외) ✅

CRUD = 만들기(Create) · 읽기(Read) · 고치기(Update) · 지우기(Delete). 사진은 다음 단계에서 붙여요.

| 파일 | 하는 일 |
| --- | --- |
| `supabase/migrations/002_goguma_items.sql` | `items` 테이블 + RLS(누구나 보기, 본인만 쓰기/고치기/지우기) + 수정 시각 자동 갱신 |
| `src/lib/items.ts` | 판매글 목록 / 검색 / 한 개 읽기 (R) |
| `src/app/items/actions.ts` | `createItem`, `updateItem`, `deleteItem` Server Actions (C, U, D) |
| `src/components/ItemForm.tsx` | 글쓰기·고치기 공용 입력 폼 (제목, 카테고리, 가격, 설명, 판매 상태) |
| `src/app/write` | 판매글 쓰기 화면 |
| `src/app/items/[id]` | 판매글 상세 화면 (내 글이면 수정/삭제 버튼) |
| `src/app/items/[id]/edit` | 판매글 고치기 화면 (본인만) |
| `src/components/ItemList.tsx`, `ItemCard.tsx` | 홈·카테고리·검색의 판매글 목록 (예시 데이터 → DB) |

- 사진이 없는 동안 썸네일 자리에는 카테고리 그림과 배경색을 보여 줘요.
- 판매 상태(판매중/예약중/거래완료)는 '고치기'에서 바꿀 수 있어요.

## 3단계: 판매글 사진 (최대 10장) ✅

| 파일 | 하는 일 |
| --- | --- |
| `supabase/migrations/003_goguma_item_photos.sql` | `items.photos`(사진 경로 목록, 최대 10개) + Storage 버킷 `goguma-item-photos` + 내 폴더에만 올리기/지우기 정책 |
| `src/lib/photos.ts` | 브라우저에서 사진 줄이기(긴 쪽 1600px, JPG) + Storage에 올리기 |
| `src/components/PhotoPicker.tsx` | 사진 고르기, 미리보기, 빼기, 대표 사진 바꾸기 |
| `src/components/ItemForm.tsx` | 저장 시 새 사진부터 올리고 → 사진 경로와 글 내용을 Server Action으로 |
| `src/app/items/actions.ts` | 사진 경로 검사, 수정 때 뺀 사진·삭제한 글의 사진을 Storage에서도 지우기 |
| `src/components/PhotoGallery.tsx` | 상세 화면에서 사진 옆으로 넘겨 보기 |

### 흐름
1. 사진을 고르면 브라우저가 바로 크기를 줄여 미리보기를 보여 줘요.
2. 저장을 누르면 새 사진을 Storage의 `{내 사용자 id}/{무작위 이름}.jpg` 에 올려요. (서버를 거치지 않아 용량 한도 걱정 없음)
3. 글에는 사진 경로만 순서대로 저장돼요. 첫 번째 사진이 대표 사진이에요.
4. 화면에서는 `next/image`가 사진을 화면 크기에 맞게 줄여서 보여 줘요. (`next.config.ts`의 `images.remotePatterns`)

## 4단계: 좋아요(관심) + 판매자·구매자 1:1 채팅 ✅

| 파일 | 하는 일 |
| --- | --- |
| `supabase/migrations/004_goguma_likes_chat.sql` | `item_likes`, `chat_rooms`, `chat_messages` 테이블 + RLS + 숫자 자동 갱신 트리거 + Realtime |
| `src/app/items/like-actions.ts`, `src/components/LikeButton.tsx` | ♡ 누르기/취소 (누르는 즉시 화면 반영: `useOptimistic`) |
| `src/app/my/likes` | 관심목록 (내가 ♡ 누른 글) |
| `src/app/chat/actions.ts` | '채팅하기' → 이 글로 연 방이 있으면 그 방, 없으면 새 방 |
| `src/app/chat`, `src/app/chat/[roomId]` | 채팅 목록(안 읽은 수) / 1:1 대화방 |
| `src/components/ChatRoomView.tsx` | 메시지 보내기 + Supabase Realtime으로 새 메시지·읽음 표시 바로 반영 |
| `src/lib/social.ts` | 좋아요·채팅 데이터 읽기 |

### 보안 규칙 (RLS)
- 좋아요: 누가 눌렀는지는 본인만 보고, 화면엔 숫자(`items.like_count`)만 보여요.
- 채팅방·메시지: 방의 두 사람(판매자·구매자)만 보고 보낼 수 있어요. 방은 구매자가 만들고, 판매자는 그 글의 진짜 판매자여야 해요.
- 메시지는 보낸 뒤 내용을 못 고치고, 상대 메시지의 '읽음'(`read_at`)만 표시할 수 있어요.

### 개발 팁
- 판매자·구매자를 동시에 시험하려면 `localhost:3000`(한 계정)과 `127.0.0.1:3000`(다른 계정)을 따로 열어요. (`next.config.ts`의 `allowedDevOrigins`)

## 5단계: 판매글 댓글 ✅

| 파일 | 하는 일 |
| --- | --- |
| `supabase/migrations/005_goguma_item_comments.sql` | `item_comments` 테이블 + RLS (누구나 읽기 / 로그인한 본인만 쓰기 / 쓴 사람·판매자만 지우기) |
| `src/app/items/comment-actions.ts` | `addComment`, `deleteComment` Server Actions |
| `src/components/CommentForm.tsx`, `DeleteCommentButton.tsx` | 댓글 입력칸 / 삭제 버튼 |
| `src/app/items/[id]/page.tsx` | 상세 화면 아래 댓글 목록 (판매자 댓글엔 '판매자' 표시) |

## 6단계: 완성도 다듬기 — 신뢰·거래·동네 ✅

객관적으로 부족했던 디자인·기능·보이지 않는 부분을 한 번에 보완했어요.

**디자인**
- 좁은 휴대폰에서 머리말 줄바꿈 수정, 채팅 입력칸 항상 아래, 상세 가격 중복 제거
- 오류 안내(`error.tsx`) · 없는 페이지(`not-found.tsx`), 작업 후 토스트(`?toast=`), 로딩 틀(스켈레톤)
- PC 상세 2단 배치, 사진 눌러서 크게 보기, 프로필 이모지(🍠🥔🌽…)

**거래·신뢰**
- 거래완료 때 구매자 고르기(이 글로 채팅한 사람 중) → 판매내역/구매내역
- 거래 후기(최고예요/괜찮아요/별로예요) → 고구마 온도 자동 변화 (사용자가 직접 못 고쳐요)
- 판매자 프로필(`/users/[id]`): 온도·받은 후기·올린 물건
- 신고(`reports` 표, 운영자는 Supabase 대시보드에서 확인)·차단(서로 채팅 불가, 글·댓글 숨김)
- 도배 방지: 채팅 20개/분, 댓글 5개/분, 판매글 10개/시간 등 (DB 트리거)

**알림·채팅**
- 🔔 알림(내 글 댓글·좋아요, 거래완료, 후기, 동네생활 댓글) + 메뉴의 안 읽은 숫자(실시간)
- 채팅 사진 보내기(비공개 버킷 `goguma-chat-photos`, 방의 두 사람만), 가격 제안, 채팅방 나가기

**동네·검색**
- 홈 "전체 / 📍 내 동네" 탭, 더 보기, 끌어올리기(하루 1번)
- 검색 필터: 카테고리·가격대·거래완료 숨기기·정렬(최신/인기/가격)
- 동네생활 게시판(`/community`): 주제별 글·댓글·내 동네만

**계정**
- 내 정보 수정(닉네임·동네·프로필 그림), 비밀번호 바꾸기/찾기(메일), 회원 탈퇴
- 카톡 등 링크 공유 미리보기(판매글 제목·대표 사진)

| 주요 파일 | 하는 일 |
| --- | --- |
| `supabase/migrations/006~008_*.sql` | 위 기능의 표·RLS·트리거·버킷 |
| `src/lib/items.ts` `findItems()` | 목록 하나로 홈·카테고리·검색·판매내역 처리 (필터·정렬·차단 숨김·더 보기) |
| `src/lib/trust.ts`, `src/lib/community.ts` | 프로필·후기·알림·차단 / 동네생활 데이터 |
| `src/app/items/trade-actions.ts`, `src/app/safety/actions.ts`, `src/app/my/actions.ts` | 거래·후기·끌올 / 신고·차단 / 내 정보 Server Actions |
| `src/components/useBadges.tsx` | 안 읽은 채팅·알림 숫자 (실시간) |

## 7단계: 운영·신뢰 마무리 ✅

| 기능 | 파일 |
| --- | --- |
| 🏷️ 키워드 알림 (새 글 제목에 내 키워드 → 🔔, 10개까지) | `src/app/my/keywords`, DB `keyword_alerts` + 트리거 |
| 🛡️ 운영자 신고 처리 (접수/처리완료/반려, 글 숨기기, 댓글·글 지우기, 신고자에게 결과 알림) | `src/app/admin/reports`, `src/app/admin/actions.ts`, DB `goguma_admins` |
| 📍 위치 기반 동네 인증 (위치 → 동네 이름은 서버가 Nominatim으로 찾아요) | `src/app/my/region`, `src/lib/region.ts` |
| 📜 이용약관·개인정보처리방침 + 가입 동의 | `src/app/terms`, `src/app/privacy` |
| 📱 홈 화면에 앱처럼 설치(PWA), 앱 아이콘 | `src/app/manifest.ts`, `icon.tsx`, `apple-icon.tsx` |
| 🔎 검색엔진용 sitemap·robots, 동네생활 공유 미리보기 | `src/app/sitemap.ts`, `robots.ts` |
| ⌨️ 접근성: 본문으로 건너뛰기, 키보드 포커스 테두리 | `src/app/layout.tsx`, `globals.css` |
| 🧪 자동 테스트 (Vitest, 26개) | `npm test`, `src/lib/__tests__` |

- 운영자 지정·해제는 Supabase SQL에서만: `insert into goguma_admins (user_id) values ('사용자 id');`
- 동네 인증은 브라우저가 알려 준 위치를 믿어요. (웹에서는 위치 조작을 완전히 막을 수 없어요)

## 8단계: 실제 마켓처럼 — 거래 약속·대댓글·접속 중 ✅

| 기능 | 어떻게 |
| --- | --- |
| 🤝 거래 약속 (구매확정) | 채팅방 위 '거래 약속 잡기' → 가격·날짜·장소 제안 → 상대 **수락 시 자동 예약중** → 판매자 **거래완료** / 누구나 **약속 취소**(다시 판매중). 단계마다 대화방에 자동 안내. DB `deals` + 트리거가 순서를 지켜요 |
| ↳ 대댓글 | 판매글·동네생활 댓글에 '답글 달기' (한 단계), 원댓글 쓴 사람에게 알림 |
| 🟢 접속 중인 이웃 | Supabase Realtime Presence. 머리말 "n명 접속 중" → `/online`, 프로필·채팅·판매자 카드에 접속 중 / 'n분 전 접속'. 내 정보 수정에서 끌 수 있어요 |
| 🏷️ 상품 상태·거래 방법 | 새상품/거의 새것/사용감 있음/고장·부품용, 직거래/택배 — 글쓰기·상세·검색 필터 |
| 👀 조회수·최근 본 상품 | 하루 한 사람당 1회 집계, 최근 본 상품은 이 브라우저에만 저장 |
| 🍠 추천 | 상세 화면에 '판매자의 다른 상품', '이런 상품은 어때요?'(같은 카테고리) |
| 📉 가격 내림 알림 | ♡ 누른 상품의 가격이 내려가면 알림 (같은 상품은 하루 1번) |

### 검증 방법
- DB 시나리오: 판매자·구매자·제3자 권한으로 실제 흐름을 돌려 보고 되돌리기 (32가지 확인)
- 브라우저 자동 시험: Edge 두 개(판매자·구매자)로 제안→수락→예약중→거래완료, 답글, 접속 중, 최근 본 상품, 검색 필터 (17가지)
- 독립 코드 리뷰 1회 → 지적 8건 반영(013·014 마이그레이션)

### 2차 검증 (015 마이그레이션) — "쓰다 보면 부딪히는 상황" 위주
| 상황 | 이제는 |
| --- | --- |
| 수정 화면을 열어 둔 사이 예약이 잡힘 → 저장 | 판매 상태는 직접 바꿨을 때만 저장, 예약 유지 |
| 판매글을 지움 | 받은 후기는 남아요(물건 제목만 글자로). 예약중인 글은 약속 정리 후 삭제 |
| 구매자가 탈퇴 | 잡혀 있던 약속이 취소되고 물건이 다시 판매중 |
| 되판 물건 | 새 구매자에게도 후기를 남길 수 있어요 |
| 답글 달린 원댓글 삭제 | '삭제된 댓글이에요' 자리만 남고 답글은 그대로 |
| 차단한 사이 | 댓글·좋아요·가격 알림이 오지 않고, 남아 있던 안 읽은 채팅 숫자도 정리 |
| 운영자가 숨긴 글 | 진행 중인 약속이 자동 취소되고 대화방에 안내 |
| 예약중에 다른 사람에게 거래완료 | 예약된 그 사람만 고를 수 있어요 |
| 구매내역 | 거래완료된 것만 (예약중은 아직 산 게 아니에요) |
- DB 시나리오 15가지, 브라우저 자동 시험 22가지로 확인했어요.

### 3차 검증 (016·017 마이그레이션) — 채팅·실시간·목록·폼 위주
| 상황 | 이제는 |
| --- | --- |
| 두 방에서 같은 순간 약속 수락 | 물건을 먼저 잠그는 함수(`goguma_set_deal_status`)로 바꿔서 서로 멈추지 않아요 |
| 숨긴 글을 산 사람 | 그 글을 보고 후기를 남길 수 있어요 (다른 사람에겐 여전히 안 보임) |
| 차단하면 | 둘 사이의 진행 중인 약속이 취소되고, 차단당한 사람 화면에서도 보내기·약속이 막혀요 |
| 차단된 사이 채팅방의 사진 | 사진 주소를 끝없이 다시 요청하던 문제 해결 |
| 채팅 메시지 순서 | 도착 순서가 바뀌어도 보낸 시각 순으로 |
| 로그아웃·다른 계정 로그인 | '접속 중' 표시가 새로고침 없이 바로 바뀌어요 |
| 숨긴 글 | 홈·검색·카테고리 목록에 섞이지 않아요 (내 판매·구매내역에만) |
| 이상한 주소(`?n=1.5`)·검색어 `*` | 오류 화면·전체 목록 대신 정상 화면 |
| 댓글·프로필 저장 실패 | 적던 내용이 지워지지 않아요 |
| 알림 | 숨긴 글 알림은 흐리게(링크 없음), 열자마자 '새 알림' 표시가 사라지지 않게 |
- DB 시나리오 19가지, 브라우저 자동 시험 23가지(로그아웃 시 접속 중 해제 포함)로 확인했어요.

### 푸시 알림 (019)
- 켜기: 나의 고구마 또는 알림 화면의 **📲 푸시 알림 → 켜기** (기기마다 따로 켜요)
- 흐름: 새 채팅 메시지·새 알림 → DB 트리거(`goguma_push_hook`, pg_net) → Edge Function `goguma-push` → 받는 사람 기기
- 서비스 워커: `public/sw.js` (알림 표시·누르면 그 화면 열기, 지금 보고 있는 화면이면 띄우지 않음)
- 비밀 값은 Supabase **Vault**에만 있어요: `goguma_vapid_private`(VAPID 비밀 열쇠), `goguma_push_hook`(트리거↔함수 암호). 공개 열쇠는 `src/lib/push.ts`.
- 로그아웃하면 그 기기의 구독을 지워요. 아이폰은 '홈 화면에 추가'한 앱에서만 받을 수 있어요(iOS 16.4+).
- 함수 코드는 `supabase/functions/goguma-push/index.ts`에 보관해요(배포는 Supabase에).

### 근처 동네 보기 (018)
- `goguma_regions`: 동네 이름 → **동네 중심** 좌표. 사람의 실제 위치는 저장하지 않아요.
- 프로필 저장·동네 인증·가입 때 새 동네면 서버가 OpenStreetMap에서 좌표를 찾아 한 줄 추가해요(`src/lib/geo.ts`). 행정구역·지명만 받아요.
- 홈의 근처/넓게 탭은 내 동네에서 km 안의 동네 이름들을 찾아 그 동네 글을 함께 보여 줘요.
- 지도에 없는 이름(직접 지어 쓴 동네)은 근처를 계산할 수 없어서, 우리 동네 글만 보여 주고 '동네 인증'을 안내해요.

### 알고 있는 한계
- 동네 인증·조회수는 브라우저가 보내는 값을 믿어요. (웹에서는 위치·조회 조작을 완전히 막을 수 없어요)

## 디자인 테마 — 구황작물 / 향토
한지 배경, 흙색 글자, 고구마 껍질 자주색 버튼, 군고구마 속살 노란색 강조.
색상과 버튼 스타일은 `src/app/globals.css` 의 `@theme` 과 `@utility` 에 모여 있습니다.

## 다음 단계 (예정)
- [x] 판매글 올리기 / 목록 / 상세 / 수정 / 삭제 (사진 제외)
- [x] 판매글 사진 업로드 (Supabase Storage, 최대 10장)
- [x] 좋아요(관심목록), 판매자·구매자 1:1 채팅
- [x] 판매글 댓글
- [x] 거래완료·후기·고구마 온도, 알림, 신고·차단, 동네생활, 검색 필터, 끌어올리기, 내 정보 관리
- [x] 키워드 알림, 운영자용 신고 처리 화면, 동네 인증(위치), 약관·개인정보, PWA, 자동 테스트
- [x] 거래 약속(구매확정→예약중→거래완료), 대댓글, 접속 중인 이웃, 상품 상태·거래 방법, 조회수, 최근 본 상품, 추천, 가격 내림 알림
- [x] 2차 검증: 거래·후기·댓글·차단·탈퇴가 얽히는 상황 정리 (015)
- [x] 3차 검증: 동시 수락·차단과 약속·채팅·접속 상태·목록·폼 정리 (016·017)
- [x] 푸시 알림: 사이트를 닫아도 새 채팅·댓글·거래 소식이 기기 알림으로 (019 + Edge Function `goguma-push`)
- [x] 근처 동네 보기: 홈에서 우리 동네만 / 근처(~12km) / 넓게(~25km) (018 `goguma_regions` 동네 위치표)
- [x] 배포 (가계부와 다른 주소로)
