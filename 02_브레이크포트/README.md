# 몬스터 클래스 (Break Fort)

실시간 1:1 카드 배치 타워 공성 게임 (모바일 웹).

## 실행
```bash
npm install
npm run dev        # 서버(ws://localhost:2567) + 클라이언트(http://localhost:5173)
npm test           # 전투 시뮬레이션 테스트
npm run typecheck
```
**폰에 앱으로 설치 / 서버 배포: [docs/INSTALL.md](docs/INSTALL.md)** (안드로이드 APK: `npm run apk -- --server wss://<서버 주소>`, 배포 설정: `render.yaml`)

휴대폰 테스트: PC와 같은 Wi-Fi에서 `http://<PC IP>:5173` 접속 (서버 주소는 자동으로 같은 IP의 2567 포트, `VITE_SERVER_URL`로 변경 가능).

### 경기 흐름 자동 점검 (서버 실행 중일 때)
```bash
npx tsx server/scripts/flow-test.ts   # 카운트다운 → 끊김 → 자동 재연결 → 재접속 → 기권
```

### 밸런스 점검
```bash
npx tsx shared/scripts/balance.ts      # 카드 1:1 대결표 + 비용 대비 점수 + 타워 공격력
npx tsx shared/scripts/botstats.ts 30  # 봇 대 봇 30경기 통계
npx tsx server/scripts/ai-fallback-test.ts   # (서버 실행 중) 빠른 매칭 AI 배정·덱 검증
```
기획 점검 기록: [docs/PREMORTEM.md](docs/PREMORTEM.md)

### 온라인 대전 테스트 상대 (헤드리스 봇)
```bash
npm run bot -w server            # 빠른 매칭 대기
npm run bot -w server -- ABCDE   # 친구 방 코드로 참가
```

## 구조
- `shared/` — 카드 데이터(`data/cards.json`), 전투 시뮬레이션(`src/sim.ts`), 봇(`src/bot.ts`). 서버·클라이언트 공용.
- `client/` — Phaser 4 + Vite. `scenes/MenuScene.ts`, `scenes/BattleScene.ts`.
- `shared/src/net.ts` — 네트워크 프로토콜(스냅샷, 입력 검증).
- `server/` — Colyseus. `rooms/BattleRoom.ts`: 서버가 전투를 20Hz로 직접 계산(치팅 방지), 클라이언트는 배치 입력만 전송. 빠른 매칭(공개 방) + 5자리 코드 친구 방(비공개).
- `client/src/net/session.ts` — 서버 연결, 스냅샷 버퍼링(2틱 지연 재생으로 끊김 완화).
- `design/` — 디자이너 아트북 원본(`art.js`, `assets/`, 시안 HTML). **게임 코드에서 수정하지 않음.**
- `client/public/assets/` — 게임이 불러오는 그림. `node client/scripts/build-assets.mjs`로 `design/assets`에서 필요한 것만 복사하고, 전장 스프라이트가 없는 카드는 `design/art.js`로 같은 규격으로 렌더링합니다(앱 아이콘도 `client/public/icons`로 복사). 디자이너가 그림을 다시 뽑으면 이 명령만 다시 실행하면 됩니다.
- `client/src/assets.ts` — 그림·폰트 로딩, 걷기/공격 애니메이션. `client/src/art.ts` — 그림 파일이 없을 때 쓰는 임시(코드로 그린) 그래픽.
- `client/src/ui/widgets.ts` — 아트북 버튼, 카드(잉크 방울에 코스트·리본에 이름), 대화 상자.
- 디자인 적용 결과와 디자이너 확인 요청: [docs/DESIGN_FEEDBACK.md](docs/DESIGN_FEEDBACK.md)
- `client/src/audio.ts` — 효과음을 Web Audio로 실시간 합성(음원 파일 없음). 메뉴에서 소리 켬/끔(기기에 저장).

## 모바일 / 앱 설치
- 세로 화면 전용: 휴대폰을 가로로 돌리면 "세로로 돌려주세요" 안내.
- 안드로이드는 첫 터치 때 전체 화면으로 전환(iOS 사파리는 미지원이라 페이지 그대로).
- 홈 화면에 추가(PWA) 가능: 아이콘·매니페스트·서비스 워커 포함. 서비스 워커는 빌드(`npm run build`) 버전에서만 동작하며, 설치 후에는 오프라인에서도 연습 대전 가능.
- 앱 아이콘은 디자이너 파일(`design/assets/icons`)을 `build-assets.mjs`가 복사합니다.

## 밸런싱
카드 수치는 `shared/data/cards.json` 만 수정하면 됩니다.

## 경기 규칙 요약
- 3초 카운트다운 후 3분 경기, 마지막 1분 마나 2배, 동점이면 1분 연장(마나 3배, 먼저 타워를 부수면 승리).
- 본진은 공격받거나 보조 타워가 무너지기 전까지 공격하지 않음(어둡게 표시).
- 연결이 끊기면 자동 재연결 시도, 새로고침해도 30초 안에 같은 경기로 복귀. 30초가 지나면 패배 처리.
- 언제든 기권 가능(확인창).
- 카드 23장 중 8장으로 덱 구성(덱 편집 화면). 빠른 매칭에서 15초 안에 상대가 없으면 AI와 대전(트로피 절반).
- 트로피: 승리 +30, 패배 −20. 등급은 견습 병사 → 브론즈 → 실버 → 골드 → 플래티넘 → 전설의 요새. (현재는 기기에만 저장)
