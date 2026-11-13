# 자동 검사 요약 (20261113-123110, quick)

빌드 정보
- 검사 시각: 20261113-123110
- package.json 버전: 0.6.0
- 가장 최근 수정된 소스: 2026-11-13 12:25 src/platform/index.ts
- 설치파일: release/삼국지 천하쟁패 Setup 0.1.0.exe release/삼국지 천하쟁패 Setup 0.2.0.exe release/삼국지 천하쟁패 Setup 0.2.1.exe release/삼국지 천하쟁패 Setup 0.3.0.exe release/삼국지 천하쟁패 Setup 0.5.0.exe release/삼국지 천하쟁패 Setup 0.6.0.exe 

| 단계 | 종료 코드 | 결과 |
|---|---|---|
| typecheck | 0 |  |
| unit-tests | 0 | [2m   Start at [22m 12:31:18 [2m   Duration [22m 113.61s[2m (transform 1.70s, setup 0ms, collect 7.16s, tests 161.85s, environment 3ms, prepare 1.90s)[22m |
| validate-data | 0 | 무장 726명, 도시 46개, 시나리오 6개 데이터 검증 통과  |
| probe-data | 1 | 실행 시간 0.4s · PASS 18 · FAIL 1 · WARN 7 · SKIP 0 · INFO 17 |
| probe-text | 1 | 실행 시간 13.4s · PASS 3 · FAIL 1 · WARN 1 · SKIP 0 · INFO 0 |
| probe-save | 0 | 실행 시간 82.0s · PASS 11 · FAIL 0 · WARN 0 · SKIP 0 · INFO 1 |
| probe-battle | 0 | 실행 시간 10.7s · PASS 10 · FAIL 0 · WARN 2 · SKIP 0 · INFO 6 |
| probe-plan | 1 | 실행 시간 16.3s · PASS 13 · FAIL 1 · WARN 2 · SKIP 0 · INFO 6 |
| probe-edge | 1 | 실행 시간 29.9s · PASS 10 · FAIL 1 · WARN 0 · SKIP 0 · INFO 3 |
| probe-mobile | 0 | 실행 시간 51.5s · PASS 11 · FAIL 14 · WARN 15 · SKIP 2 · INFO 9 |
| probe-sim | 0 | 실행 시간 62.8s · PASS 15 · FAIL 0 · WARN 0 · SKIP 0 · INFO 8 |

## FAIL 모음

| FAIL | D1-01 | S1 | 개발 | 기존 게임 고유 명칭 의심 1곳 — 사람이 판정 (특기·기술 이름이면 교체) |
| FAIL | D2-08 | S3 | 개발 | 군주 포로 상황 팝업 순서가 결과→원인: 군주 포로 → 군주 계승 → 전투 결과 |
| FAIL | M1-터치크기 02-newgame-1 [iphone14] | S2 | 디자인 | 44px 미만 터치 영역 1개 (36px 미만 1개, 배율 1) |
| FAIL | M1-터치크기 02-newgame-2 [iphone14] | S2 | 디자인 | 44px 미만 터치 영역 5개 (36px 미만 5개, 배율 1) |
| FAIL | M2-겹침 02-newgame-2 [iphone14] | S2 | 디자인 | 서로 겹친 터치 영역 5쌍 — 손가락으로 원하는 걸 못 누름 |
| FAIL | M3-화면밖 02-newgame-2 [iphone14] | S2 | 디자인 | 화면 밖으로 나간 조작 요소 10개 |
| FAIL | M1-터치크기 04-map [iphone14] | S2 | 디자인 | 44px 미만 터치 영역 6개 (36px 미만 6개, 배율 1) |
| FAIL | M2-겹침 04-map [iphone14] | S2 | 디자인 | 서로 겹친 터치 영역 2쌍 — 손가락으로 원하는 걸 못 누름 |
| FAIL | M11-턴 [iphone14] | S1 | 개발 | 턴 종료 후 15초 안에 조작 가능한 상태로 안 돌아옴 |
| FAIL | M11-턴 [iphone14] | S3 | 개발 | 턴 처리(팝업 닫기 포함) 최대 15932ms (CPU ×2, 목표 5초) |
| FAIL | M1-터치크기 11-after-turns [iphone14] | S2 | 디자인 | 44px 미만 터치 영역 9개 (36px 미만 9개, 배율 1) |
| FAIL | M2-겹침 11-after-turns [iphone14] | S2 | 디자인 | 서로 겹친 터치 영역 4쌍 — 손가락으로 원하는 걸 못 누름 |
| FAIL | M1-터치크기 12-sortie [iphone14] | S2 | 디자인 | 44px 미만 터치 영역 11개 (36px 미만 11개, 배율 1) |
| FAIL | M2-겹침 12-sortie [iphone14] | S2 | 디자인 | 서로 겹친 터치 영역 2쌍 — 손가락으로 원하는 걸 못 누름 |
| FAIL | M3-화면밖 12-sortie [iphone14] | S2 | 디자인 | 화면 밖으로 나간 조작 요소 1개 |
| FAIL | M-예외 [galaxyA] | S2 | 개발 | 프로브 진행 중 예외: No target available |
| FAIL | BP-01a | S2 | 개발 | 지배 방침(평균 승률 62% 초과): 매복 요격 63.9% — 게이머는 이것만 쓴다 |
| FAIL | C5-01 | S3 | 개발 | 조사 병기 53곳 (49줄) — 받침에 따라 조사를 고르는 함수 필요, 문장은 시나리오 참조 |

## WARN 모음

| WARN | D4-01 |  | 개발 | 수군 특기 없이 강(river) 칸에 선 부대-틱 385회 — 현재 규칙은 강 도하 허용(이동 3.5). 위시리스트 "강은 수군만"과 다름 → 방침 확인 |
| WARN | D4-02 |  | 개발 | 30일 경과 2건이 모두 수비 승리로 끝남 — 35-1은 "공성은 포위 상태로 다음 달 이월". 방침 확인 |
| WARN | C2-05 |  | 시나리오 | 12세 미만 등장 2명 (근거 있으면 통과) |
| WARN | C1 s184 |  | 시나리오 | 배치 경고 1건 |
| WARN | C1 s190 |  | 시나리오 | 배치 경고 1건 |
| WARN | C1 s208 |  | 시나리오 | 배치 경고 1건 |
| WARN | C4-07 |  | 시나리오 | 후대 지명 건업·허창·영안·건녕·운남 사용 — 시대별 표기 방침 결정 필요 (오류 아님) |
| WARN | C4-03 |  | 시나리오 | 촉 건흥(223~) 등 220년대 후속 연호 없음 — 223년 이후 진행 시 장무가 계속 이어짐 |
| WARN | C4-03 |  | 시나리오 | 위 태화(227~) 이후 연호 없음 — 장기 진행 시 황초가 끝없이 이어짐 |
| WARN | M4-글자 01-title [iphone14] |  | 디자인 | 실제 11px 미만 글자 6종 (9px 미만 0종) |
| WARN | M6-zoom |  | 개발 | meta viewport에 확대 차단이 없음 — touch-action으로 막더라도 iOS Safari·일부 WebView는 두 번 탭 확대가 생길 수 있음 |
| WARN | M4-글자 02-newgame-1 [iphone14] |  | 디자인 | 실제 11px 미만 글자 13종 (9px 미만 0종) |
| WARN | M2-간격 02-newgame-2 [iphone14] |  | 디자인 | 간격 4px 미만으로 붙은 작은 버튼 1쌍 (오터치) |
| WARN | M4-글자 02-newgame-2 [iphone14] |  | 디자인 | 실제 11px 미만 글자 22종 (9px 미만 0종) |
| WARN | M6-안전영역 02-newgame-2 [iphone14] |  | 디자인 | 화면 가장자리 16px 안의 조작 요소 10개 — 노치·둥근 모서리에 가려질 수 있음 |
| WARN | M4-글자 04-map [iphone14] |  | 디자인 | 실제 11px 미만 글자 20종 (9px 미만 0종) |
| WARN | M7-title 04-map [iphone14] |  | 디자인 | title 속성 툴팁 5개 — 터치에서는 안 보임 |
| WARN | M9-대기프레임 [iphone14] |  | 개발 | 아무 조작 없는데 60fps로 계속 그림 → 폰 배터리·발열 (변화 있을 때만 그리기 권장) |
| WARN | M2-간격 11-after-turns [iphone14] |  | 디자인 | 간격 4px 미만으로 붙은 작은 버튼 4쌍 (오터치) |
| WARN | M4-글자 11-after-turns [iphone14] |  | 디자인 | 실제 11px 미만 글자 32종 (9px 미만 0종) |
| WARN | M7-title 11-after-turns [iphone14] |  | 디자인 | title 속성 툴팁 10개 — 터치에서는 안 보임 |
| WARN | M2-간격 12-sortie [iphone14] |  | 디자인 | 간격 4px 미만으로 붙은 작은 버튼 4쌍 (오터치) |
| WARN | M4-글자 12-sortie [iphone14] |  | 디자인 | 실제 11px 미만 글자 17종 (9px 미만 0종) |
| WARN | M7-title 12-sortie [iphone14] |  | 디자인 | title 속성 툴팁 5개 — 터치에서는 안 보임 |
| WARN | BP-02 |  | 개발 | 상성 표기와 실제가 어긋나는 조합 1/29 |
| WARN | BP-03 |  | 개발 | 위임이 아무 방침보다 못함 (47.2% < 52.8%) — 위임 버튼이 함정이 됨 |
| WARN | C5-03 |  | 시나리오 | 혼용 용어 군량/병량, 무장/장수, 계략/계책 — 하나로 통일할지 결정 |
