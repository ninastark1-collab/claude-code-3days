# 폰에 설치하기 & 서버 배포

## 지금 바로 (같은 네트워크에서 테스트)
이 PC에서 서버가 켜져 있을 때(`npm run dev` 또는 `npm run start -w server`):

- **안드로이드 앱 받기:** 폰 브라우저에서 `http://<PC IP>:2567/app.apk` 열기 → 다운로드 → 설치
  - 처음이면 "출처를 알 수 없는 앱 설치"를 허용하라는 안내가 뜹니다(설정 → 브라우저 앱 → 이 출처 허용).
  - 지금 만든 테스트용 APK는 이 PC(`ws://<PC IP>:2567`)에 접속합니다. 연습 대전은 어디서나 되고, 온라인 대전은 같은 네트워크에서만 됩니다.
- **웹으로 하기:** `http://<PC IP>:5173`

## 어디서나 되게 하기 (공개 서버 배포)
게임 서버와 웹 게임을 한 주소로 올리는 설정이 `render.yaml`에 들어 있습니다.

1. **GitHub에 저장소 올리기** (비공개 저장소도 됩니다)
2. **Render 가입** — https://render.com (GitHub 계정으로 가입하면 편합니다)
3. Render 대시보드 → **New → Blueprint** → 이 저장소 선택 → `render.yaml`대로 생성
4. 배포가 끝나면 `https://monster-class-xxxx.onrender.com` 같은 주소가 생깁니다.
   - 이 주소를 열면 바로 게임이 됩니다(웹앱).
   - 무료 요금제는 15분 동안 접속이 없으면 잠들고, 다음 접속 때 깨어나는 데 1분 정도 걸립니다. 상시 운영은 유료 요금제(월 7달러~)가 필요합니다.
5. **공개 서버용 APK 만들기** (주소의 `https`를 `wss`로):
   ```bash
   npm run apk -- --server wss://monster-class-xxxx.onrender.com
   ```
   결과물: `apk/monster-class.apk` → 카카오톡·드라이브 등으로 폰에 보내 설치하거나, GitHub Releases에 올려 링크로 배포.

## 아이폰
아이폰은 앱 파일을 직접 설치할 수 없습니다(App Store 또는 개발자 계정 필요).
- **공개 주소가 생기면:** 사파리로 열기 → 공유 버튼 → **홈 화면에 추가** → 앱 아이콘으로 전체 화면 실행
- 네이티브 앱(App Store)은 Mac + Apple Developer 계정(연 99달러)이 필요합니다.

## 플레이스토어 출시 (나중에)
- Google Play Console 개발자 계정(1회 25달러), 앱 설명·스크린샷·개인정보처리방침 페이지 필요
- 앱 ID `com.breakfort.monsterclass`는 임시값입니다. **출시 전에 본인 도메인 기준으로 바꿔야 하고, 출시 후에는 바꿀 수 없습니다** (`client/capacitor.config.ts`).
- 출시용 서명 키(keystore) 생성 → `bundleRelease`로 AAB 빌드. 키는 잃어버리면 업데이트를 못 하니 안전하게 보관.

## 빌드 환경 (이 PC 기준)
- Android SDK: `%LOCALAPPDATA%\Android\Sdk` (플랫폼 36, 빌드 도구 35·36)
- JDK 21: `%USERPROFILE%\.jdks\jdk-21.0.13+9` (Eclipse Temurin, 체크섬 확인 후 설치)
- 프로젝트 폴더 이름이 한글이라 `client/android/gradle.properties`에 `android.overridePathCheck=true`를 넣어 두었습니다. 빌드 오류가 나면 영문 경로로 옮겨 빌드하세요.
- 아이콘·스플래시는 디자이너의 `design/art.js` 아이콘으로 생성: `node client/scripts/android-res.mjs` (APK 빌드 때 자동 실행)
