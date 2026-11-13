# 자동 검사 요약 (20261112-165318, quick)

빌드 정보
- 검사 시각: 20261112-165318
- package.json 버전: 0.1.0
- 가장 최근 수정된 소스: 2026-11-12 16:52 src/ui/map/geo.ts
- 설치파일: release/삼국지 천하쟁패 Setup 0.1.0.exe 

| 단계 | 종료 코드 | 결과 |
|---|---|---|
| typecheck | 0 |  |
| unit-tests | 0 | [2m   Start at [22m 16:53:23 [2m   Duration [22m 59.61s[2m (transform 450ms, setup 0ms, collect 2.71s, tests 70.87s, environment 1ms, prepare 906ms)[22m   |
| validate-data | 0 | 무장 526명, 도시 46개, 시나리오 6개 데이터 검증 통과  |
| probe-data | 1 | 실행 시간 0.3s · PASS 18 · FAIL 1 · WARN 7 · SKIP 0 · INFO 12 |
| probe-text | 1 | 실행 시간 7.7s · PASS 3 · FAIL 1 · WARN 1 · SKIP 0 · INFO 0 |
| probe-save | 1 | 실행 시간 46.9s · PASS 10 · FAIL 1 · WARN 0 · SKIP 0 · INFO 1 |
| probe-battle | 0 | 실행 시간 0.9s · PASS 9 · FAIL 0 · WARN 1 · SKIP 0 · INFO 5 |
| probe-edge | 0 | 실행 시간 13.0s · PASS 10 · FAIL 0 · WARN 0 · SKIP 0 · INFO 3 |
| probe-sim | 1 | 실행 시간 32.8s · PASS 14 · FAIL 1 · WARN 0 · SKIP 0 · INFO 8 |

## FAIL 모음

| FAIL | C2-05 | S3 | 시나리오 | 생몰·등장 이상 2건 |
| FAIL | D6-02 | S2 | 개발 | 손상 세이브 처리 문제 1건 |
| FAIL | D5-01 | S2 | 개발 | 첫 달 평균 도시 주인 변경 7.7개 (목표 ≤ 3) |
| FAIL | C5-01 | S3 | 개발 | 조사 병기 61곳 (54줄) — 받침에 따라 조사를 고르는 함수 필요, 문장은 시나리오 참조 |

## WARN 모음

| WARN | D4-01 |  | 개발 | 수군 특기 없이 강(river) 칸에 선 부대-틱 290회 — 현재 규칙은 강 도하 허용(이동 3.5). 위시리스트 "강은 수군만"과 다름 → 방침 확인 |
| WARN | C1 s184 |  | 시나리오 | 배치 경고 1건 |
| WARN | C1 s190 |  | 시나리오 | 배치 경고 1건 |
| WARN | C1 s208 |  | 시나리오 | 배치 경고 12건 |
| WARN | C1 s219 |  | 시나리오 | 배치 경고 12건 |
| WARN | C4-07 |  | 시나리오 | 후대 지명 건업·허창·영안·건녕·운남 사용 — 시대별 표기 방침 결정 필요 (오류 아님) |
| WARN | C4-03 |  | 시나리오 | 촉 건흥(223~) 등 220년대 후속 연호 없음 — 223년 이후 진행 시 장무가 계속 이어짐 |
| WARN | C4-03 |  | 시나리오 | 위 태화(227~) 이후 연호 없음 — 장기 진행 시 황초가 끝없이 이어짐 |
| WARN | C5-03 |  | 시나리오 | 혼용 용어 무장/장수 — 하나로 통일할지 결정 |
