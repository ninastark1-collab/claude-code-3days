<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# 🍠 고구마마켓 — 작업 전에 꼭 읽기

## 이 프로젝트는 개발 공부용이에요
- 주인은 **개발 공부 중**이고, 기능을 **한 단계씩 차근차근** 만들어 가고 있어요.
- 한 번에 하나의 단계만 진행해요. 요청받지 않은 다음 단계 기능(물건 올리기, 채팅 등)을 미리 만들지 마세요.
- 코드에는 **한국어 주석**으로 "이 코드가 왜 필요한지"를 짧게 설명해 주세요. 새로 나온 개념(Server Action, proxy, Suspense, RLS 등)은 처음 쓸 때 한 줄 설명을 붙여요.
- 답변과 설명도 **한국어**로 해 주세요.
- 진행 단계는 `README.md`의 "다음 단계" 체크리스트에 기록해요.

## ⚠️ Supabase는 가계부 앱과 같은 프로젝트를 재활용 중이에요
- Supabase 프로젝트 `gfcylhusujdvzsoinwoj`(서울, ap-northeast-2)는 **가계부 앱(money-ledger)과 함께 쓰는 DB**예요.
- **가계부 테이블 `transactions`, `budgets`는 절대 건드리지 마세요.** (읽기·수정·삭제·스키마 변경 모두 금지)
  - 가계부는 로그인 없이 공개 키로 쓰는 앱이라, 이 테이블들의 RLS·정책을 바꾸면 가계부가 망가질 수 있어요.
- 고구마마켓 테이블은 가계부와 이름이 겹치지 않게 지어요. 지금 고구마마켓 테이블: `profiles`, `items`(판매글), `item_likes`(좋아요), `chat_rooms`·`chat_messages`(채팅), `item_comments`(댓글), `item_reviews`(후기), `notifications`(알림), `reports`(신고), `user_blocks`(차단), `community_posts`·`community_comments`(동네생활), `keyword_alerts`(키워드), `goguma_admins`(운영자), `deals`(거래 약속), `item_views`(조회 기록), `goguma_regions`(동네 위치표), `push_subscriptions`(푸시 받을 기기), `push_sent`(보낸 푸시 기록). Storage 버킷: `goguma-item-photos`(판매글 사진, 공개), `goguma-chat-photos`(채팅 사진, 비공개). 내부 도우미 함수는 API에 안 열린 `goguma_private` 스키마에 둬요.
- 인증(`auth.users`)도 두 앱이 같은 공간을 써요. 가계부는 로그인을 안 쓰지만, 사용자를 일괄 삭제하는 등 auth 전체에 영향을 주는 작업은 하지 마세요.
- DB를 바꿀 때는 **반드시 SQL 파일을 `supabase/migrations/`에 번호 순서대로 남기고**(예: `002_goguma_items.sql`), 모든 새 테이블에 **RLS를 켜고 정책을 함께** 만들어요. 바꾼 뒤에는 Supabase 보안 점검(advisors)을 돌려 확인해요.
- 데이터를 지우거나 테이블을 없애는 작업은 먼저 주인에게 물어보세요.
- 운영자는 `goguma_admins` 표에 있는 사람(지금: 고구마대장). 앱에서는 운영자를 추가할 수 없고 Supabase SQL에서만 바꿔요.
- **거래 약속 흐름**은 DB 트리거가 지켜요: `goguma_deal_guard`(누가 어떤 단계로), `goguma_deal_effects`(물건 상태 바꾸기 + 대화방 안내), `goguma_item_deal_sync`(판매자가 상태를 직접 바꿀 때 약속 정리). 트리거끼리 서로 바꿀 땐 `goguma.internal` 표시로 검사를 건너뛰어요.
- `items`는 사용자가 고칠 수 있는 **칸이 정해져 있어요**(제목·설명·가격·카테고리·상태·사진·가격제안·상품상태·거래방법·구매자·끌올·숨김). 숨김은 운영자만(트리거). 새 칸을 사용자가 고쳐야 하면 grant를 추가해요.
- 트리거 안에서 `select … for update`는 '고칠 권한이 있는 사람'만 돼요. 다른 사람(구매자)이 하는 동작이면 security definer 도우미 함수로 잠가요. (014 참고)
- RLS 정책의 하위 질의에서 칸 이름만 쓰면 안쪽 표의 칸으로 읽힐 수 있어요. 바깥 표 칸은 `deals.item_id`처럼 표 이름을 붙여요.
- Supabase 질의는 `await`나 `.then()`을 해야 실제로 전송돼요. (그냥 부르면 아무 일도 안 일어나요)
- 실시간 구독은 `SUBSCRIBED`가 된 순간 한 번 더 불러와야, 연결 전 틈에 생긴 변화를 놓치지 않아요.
- RLS 정책 안에서 **같은 표를 다시 조회하면 무한 반복(infinite recursion)** 오류가 나요. 개수 제한 같은 건 트리거로 해요. (010 마이그레이션 참고)
- 판매 상태 저장은 **바꿨을 때만** 보내요(`originalStatus` 비교). 옛 화면의 상태를 그대로 저장하면 거래 약속이 몰래 취소돼요.
- 댓글은 답글이 있으면 진짜로 안 지우고 `is_deleted`(내용 '삭제된 댓글이에요')로 남아요(BEFORE DELETE 트리거). 화면에서 `is_deleted`를 꼭 처리해요. 댓글 `body`는 빈칸 금지 규칙이 있어요.
- 후기(`item_reviews`)는 글이 지워져도 남아요(`item_id`가 비고 `item_title`에 제목). 한 물건에 '누가→누구에게' 한 번씩이라 `hasReviewed`는 받는 사람까지 넘겨요.
- 거래 약속 안내 문구는 `goguma.reason`(status/hidden/blocked)으로 '왜 취소됐는지'를 골라요.
- 약속 단계 바꾸기는 꼭 `rpc("goguma_set_deal_status")`로 해요. 물건 줄을 먼저 잠가서 동시 수락 교착(deadlock)을 막아요. `deals`를 직접 update하지 마세요.
- `findItems`는 숨긴 글을 기본으로 빼요. 내 판매·구매내역만 `includeHidden: true`.
- 접속 중(Presence) 연결은 머리말의 `<PresenceIdentity>`가 맺어요. 같은 이름의 채널은 예전 것이 완전히 끊긴 뒤에 다시 만들어야 해요(라이브러리가 같은 이름이면 예전 채널을 돌려줘요).
- 푸시 알림: `push_subscriptions`(내 기기들), 트리거 `goguma_push_hook` → Edge Function `goguma-push`(verify_jwt 끔, 대신 Vault의 `goguma_push_hook` 암호를 헤더로 확인). 비밀 값은 Vault에만 두고 파일·깃에 넣지 마세요. 함수를 고치면 `supabase/functions/goguma-push/index.ts`도 같이 고쳐요. `supabase/functions`는 Deno 코드라 tsconfig·eslint에서 빠져 있어요.
- 근처 동네: `goguma_regions`(동네 이름 → 중심 좌표, 추가만 가능·내 프로필 동네 이름만). 동네를 저장하는 곳에서는 저장 **뒤에** `rememberRegion()`을 불러요(정책이 프로필 동네와 같은 이름만 허용). 거리 계산은 `market.ts`의 `distanceKm`.
- 주소의 개수 값(`n`)은 `safeLimit()`으로 정리해요. 소수·음수가 DB로 가면 400 오류가 나요.
- `<form action>`은 실패해도 입력칸을 되돌려요. 실패 시 내용을 지키려면 상태로 돌려받아 `defaultValue`에 넣거나 onSubmit+startTransition을 써요.
- 보안 점검에 남는 경고 `delete_my_goguma_account` (SECURITY DEFINER)는 **의도된 것**이에요. 회원 탈퇴용이고 `auth.uid()` 본인 계정만 지워요.
- `profiles.manner_temp`(고구마 온도)는 후기 트리거로만 바뀌어요. 사용자는 `nickname, region, avatar` 칸만 고칠 수 있게 막아 뒀어요.
- 비밀번호 찾기 메일 링크가 배포 주소에서 동작하려면 Supabase 대시보드 → Authentication → URL Configuration → Redirect URLs에 `https://goguma-market-blond.vercel.app/**` 를 넣어야 해요.
- 키: 코드에는 공개용 `publishable` 키만 써요. `service_role`/`secret` 키는 코드·깃에 넣지 마세요.

## 실행·배포 환경
- Node.js는 winget으로 설치했어요. 새 터미널에서 `node`가 안 잡히면 PATH를 새로 고치세요.
- 로컬: `npm run dev` → http://localhost:3000 (환경변수는 `.env.local`, 깃에 안 올라감)
- 배포: Vercel 프로젝트 `goguma-market` (https://goguma-market-blond.vercel.app). GitHub `main`에 push하면 자동 배포돼요. 가계부와는 **다른 주소로 따로** 배포해요.
- `vercel.json`의 `"regions": ["icn1"]`(서울)은 지우지 마세요. Supabase가 서울에 있어서, 미국 지역으로 돌아가면 로그인/로그아웃이 느려져요.
- Supabase 이메일 인증은 **꺼져 있어요**(가입 즉시 로그인). 켜려면 Supabase의 Redirect URLs에 배포 주소를 추가해야 해요.

## Next.js 16 주의사항 (이 프로젝트에서 실제로 겪은 것)
- `middleware.ts`가 아니라 **`src/proxy.ts`** 를 써요.
- Cache Components가 켜져 있어서, 쿠키·`searchParams`를 읽는 컴포넌트는 **`<Suspense>` 안에** 둬야 빌드가 돼요.
- 로그인 사용자는 `src/lib/auth.ts`의 `getCurrentUser()`로만 가져와요. (`cache()`로 요청당 1번만 조회하고, 안에서 `await connection()`을 먼저 불러요. Supabase 내부의 `Date.now()` 때문에 필요해요.)
- 주소가 요청 때 정해지는 화면(`/items/[id]`)이 생겨서, `usePathname()`을 쓰는 `BottomNav`도 `<Suspense>`로 감쌌어요.
- `items`와 `profiles` 사이 연결이 여러 개(판매자·좋아요·채팅·댓글)라서, 판매자 닉네임은 반드시 `seller:profiles!items_seller_id_fkey(nickname)`처럼 **연결 이름을 적어서** 불러와요. 안 적으면 "more than one relationship" 오류로 목록이 안 열려요.
- 화면을 그리는 도중 `Date.now()`를 직접 부르면 린트 에러가 나요. `src/lib/items.ts`의 `getRequestTime()`을 써요.
- Next.js 16의 `error.tsx`는 `reset`이 아니라 **`retry`**를 받아요. (`error`의 타입은 `unknown`)
- 브라우저에서 쓰는 파일(`"use client"`)이 서버 전용 파일(`supabase/server.ts`를 부르는 것)을 import하면 빌드가 깨져요. 둘 다 쓰는 값은 `topics.ts`처럼 따로 빼요.
- 클라이언트 컴포넌트의 첫 화면 값은 서버와 같아야 해요(예: 안 읽은 숫자는 0에서 시작해 effect에서 채움). 다르면 hydration 오류로 화면이 다시 그려져요.
- 판매자·구매자를 동시에 시험할 땐 `localhost:3000`과 `127.0.0.1:3000`(쿠키가 따로)을 써요. (`next.config.ts`의 `allowedDevOrigins`)
- 작업이 끝나면 `npm run build`, `npm run lint`, `npm test`가 통과하는지 확인해요.
- Server Action 안에서 `await import(...)`(필요할 때 불러오기)를 쓰면 개발 서버에서 오류가 났어요. 맨 위 import로 써요.

## 아직 예시(가짜) 데이터인 것
- 홈·카테고리·검색의 매물은 이제 DB `items` 테이블에서 불러와요. (`src/lib/items.ts`)
- 판매글 사진은 최대 10장이에요. 사진이 없는 글(샘플 글 등)은 썸네일 자리에 카테고리 그림(`CATEGORIES`의 `emoji`, `tint`)을 보여 줘요.
- 사진은 브라우저가 Storage에 직접 올려요(Server Action 용량 한도 1MB 때문). 사진 경로는 `{사용자id}/{uuid}.jpg` 모양만 허용해요.
- 나의 고구마의 모든 메뉴가 동작해요. (키워드 알림·동네 인증 포함)

## 디자인 규칙
- 테마: 구황작물·향토 느낌(한지 배경, 흙색 글자, 고구마 껍질 자주색, 군고구마 속살 노란색).
- 색과 버튼은 `src/app/globals.css`의 `@theme` / `@utility`(`card-sack`, `btn-goguma`, `btn-straw`, `field`, `stitch`)를 재사용해요.
- 고구마 캐릭터(`src/components/GogumaLogo.tsx`)는 **귀엽게** 유지해요. 꼬불꼬불한 김(냄새처럼 보임)이나 지저분한 검은 점은 넣지 않아요.
