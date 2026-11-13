# probe-mobile

실행 시간 51.5s · PASS 11 · FAIL 14 · WARN 15 · SKIP 2 · INFO 9

> 에뮬레이션 결과다. 실제 폰(특히 iOS WKWebView·보급형 안드로이드)에서 플레이테스트 S9로 반드시 다시 확인한다.

| 결과 | ID | 심각도 | 담당 | 내용 |
|---|---|---|---|---|
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
| SKIP | M-전투 [iphone14] |  |  | 터치만으로 출진→전투 화면에 들어가지 못함 (출진 대상·무장이 없을 수도 있음 — 수동 확인) |
| SKIP | M13-재시작 [iphone14] |  |  | 타이틀 "불러오기" 없음 |
| INFO | 대상 |  |  | file:///C:/Users/student/AppData/Local/Temp/samgukji-qa-autobuild/index.html · 기기 iphone14, galaxyA |
| INFO | M-흐름 [iphone14] |  |  | 새 게임 → 지도까지 2번 화면 넘김 (위시리스트: 3클릭 이내 명령) |
| INFO | M-지도 [iphone14] |  |  | 지도 캔버스 scene3d  844×390, ink-bg 844×390 |
| INFO | M9-대기프레임 [iphone14] |  |  | 지도 가만히 3초: 60fps · 긴 작업 0회 — 아무것도 안 할 때 계속 그리면 배터리 소모 |
| INFO | M10-핀치 [iphone14] |  |  | 두 손가락 확대 실행 → 06-map-pinch.png 와 05 비교해 확대됐는지 사람이 확인 |
| INFO | M10-길게누르기 [iphone14] |  |  | 지도 가운데 0.6초 누름 → 화면 글자 361→361 (정보가 열렸는지 07-longpress.png 확인) |
| INFO | M-둘러보기 [iphone14] |  |  | 버튼 10개 눌러 창 0개 열고 감사 |
| INFO | M13-저장소 [iphone14] |  |  | localStorage 사용 225KB (UTF-16 기준). 웹뷰 한도 보통 5MB — 1,000턴 세이브 크기(probe-save D6-03) × 6칸과 비교 |
| INFO | M15-메모리 [iphone14] |  |  | JS 힙 16MB · DOM 217개 (보급형 폰 웹뷰는 수백 MB에서 강제 종료될 수 있음) |
| PASS | M8-첫화면 [iphone14] |  |  | 첫 화면 2072ms (CPU ×2) |
| PASS | M1-터치크기 01-title [iphone14] |  |  | 터치 영역 3개 모두 44px 이상 (배율 1) |
| PASS | M6-viewport |  |  | width=device-width, initial-scale=1.0, viewport-fit=cover |
| PASS | M6-touch-action |  |  | body touch-action: none |
| PASS | M6-select |  |  | 글자 선택(길게 누르기 돋보기) 차단 |
| PASS | M7-hover |  |  | :hover 전용 표시 규칙 없음 |
| PASS | M8-게임시작 [iphone14] |  |  | 시작 → 지도 2722ms |
| PASS | M9-지도드래그 [iphone14] |  |  | 지도 끌기 60fps · p95 17ms |
| PASS | M12-백그라운드저장 [iphone14] |  |  | 백그라운드 전환 직후 자동 저장 |
| PASS | M14-세로 [iphone14] |  |  | 세로로 들면 "가로로 돌려 주세요" 안내 |
| PASS | M16-콘솔 [iphone14] |  |  | 콘솔 오류 없음 |

## 상세

### FAIL M1-터치크기 02-newgame-1 [iphone14]

```
← 타이틀 259×34
```

### FAIL M1-터치크기 02-newgame-2 [iphone14]

```
쉬움 45×32
보통 45×32
어려움 55×32
역사 이벤트 210×34
← 시나리오 79×34
```

### FAIL M2-겹침 02-newgame-2 [iphone14]

```
원술 원술군 · 강국 ↔ 보통
원술 원술군 · 강국 ↔ 역사 이벤트
유장 유장군 · 강국 ↔ 보통
유장 유장군 · 강국 ↔ 역사 이벤트
마등 마등군 · 중견 ↔ 역사 이벤트
```

### FAIL M3-화면밖 02-newgame-2 [iphone14]

```
마등 마등군 · 중견 @786,48
여포 여포군 · 중견 @908,48
공손찬 공손찬군 · 중견 @1030,48
유비 유비군 · 중견 @1152,48
장로 장로군 · 중견 @1274,48
유요 유요군 · 약소 @1396,48
공손도 공손도군 · 약소 @1518,48
장연 장연군 · 약소 @1640,48
공융 공융군 · 약소 @1762,48
왕랑 왕랑군 · 약소 @1884,48
```

### FAIL M1-터치크기 04-map [iphone14]

```
설정 36×30
명령 대기 도시 2 117×34
조조군 접근 94×34
자동 46×34
기록 46×34
건너뛰기 66×34
```

### FAIL M2-겹침 04-map [iphone14]

```
설정 ↔ 건너뛰기
다음 달 ↔ 확인
```

### FAIL M11-턴 [iphone14]

```
15932
```

### FAIL M1-터치크기 11-after-turns [iphone14]

```
설정 36×30
닫기 34×30
劉 유비 57×26
關 관우 57×26
糜 미축 57×26
糜 미방 57×26
孫 손건 57×26
陳 진등 57×26
陳 진규 57×26
```

### FAIL M2-겹침 11-after-turns [iphone14]

```
陳 진등 ↔ 1 政 내정
陳 진등 ↔ 2 軍 군사
陳 진규 ↔ 2 軍 군사
陳 진규 ↔ 3 人 인사
```

### FAIL M1-터치크기 12-sortie [iphone14]

```
설정 36×30
하비 21×16
뒤로 34×30
징병 42×32
훈련 42×32
출진 42×32
병력 분배 65×32
수송 42×32
낭야 (공백) 101×34
건업 (유요군) 111×34
수춘 (원술군) 111×34
```

### FAIL M2-겹침 12-sortie [iphone14]

```
陳 진등 통솔 70 병 5,000 · 훈 6 ↔ 출진!
군량 0 (최소 0 = 10일분, 보유 55 ↔ 출진!
```

### FAIL M3-화면밖 12-sortie [iphone14]

```
군량 0 (최소 0 = 10일분, 보유 55 @471,365
```

### FAIL M-예외 [galaxyA]

```
Error: No target available
    at send (C:\Users\student\Desktop\삼국지\qa\scripts\probe-mobile.cjs:141:49)
    at metrics (C:\Users\student\Desktop\삼국지\qa\scripts\probe-mobile.cjs:149:11)
    at runDevice (C:\Users\student\Desktop\삼국지\qa\scripts\probe-mobile.cjs:151:9)
    at async C:\Users\student\Desktop\삼국지\qa\scripts\probe-mobile.cjs:400:11
```

### WARN M4-글자 01-title [iphone14]

```
v (10px)
0.6.0 (10px)
· 무장 (10px)
726 (10px)
명 · 시나리오 (10px)
6 (10px)
```

### WARN M4-글자 02-newgame-1 [iphone14]

```
시나리오 (10px)
6 (10px)
개 (10px)
영웅들의 시작 (10px)
열여덟 제후가 낙양으로 (10px)
서주를 둘러싼 각축 (10px)
조조 대 원소 (10px)
손유 연합의 화공 (10px)
관우, 형주에서 북상 (10px)
세력 (10px)
16 (10px)
도시 (10px)
46 (10px)
```

### WARN M2-간격 02-newgame-2 [iphone14]

```
보통 | 어려움
```

### WARN M4-글자 02-newgame-2 [iphone14]

```
조조군 (10px)
· (10px)
강국 (10px)
원소군 (10px)
유표군 (10px)
이각군 (10px)
원술군 (10px)
유장군 (10px)
마등군 (10px)
중견 (10px)
여포군 (10px)
공손찬군 (10px)
유비군 (10px)
장로군 (10px)
유요군 (10px)
약소 (10px)
공손도군 (10px)
장연군 (10px)
공융군 (10px)
왕랑군 (10px)
주요 무장 (10px)
게임 난이도 (10px)
```

### WARN M6-안전영역 02-newgame-2 [iphone14]

```
마등 마등군 · 중견
여포 여포군 · 중견
공손찬 공손찬군 · 중견
유비 유비군 · 중견
장로 장로군 · 중견
유요 유요군 · 약소
공손도 공손도군 · 약소
장연 장연군 · 약소
공융 공융군 · 약소
왕랑 왕랑군 · 약소
```

### WARN M4-글자 04-map [iphone14]

```
公 (10px)
袁 (10px)
張 (10px)
孔 (10px)
呂 (10px)
曹 (10px)
劉 (10px)
李 (10px)
王 (10px)
194년 · 봄 (10px)
금 (10px)
병량 (10px)
병력 (10px)
도시 (10px)
세력 (10px)
무장 (10px)
외교 (10px)
연대기 (10px)
남은 명령 9 (10px)
연의 (10px)
```

### WARN M7-title 04-map [iphone14]

```
유비군
세력
무장
외교
연대기
```

### WARN M2-간격 11-after-turns [iphone14]

```
劉 유비 | 關 관우
糜 미축 | 糜 미방
糜 미방 | 孫 손건
陳 진등 | 陳 진규
```

### WARN M4-글자 11-after-turns [iphone14]

```
公 (10px)
袁 (10px)
張 (10px)
孔 (10px)
呂 (10px)
曹 (10px)
劉 (10px)
王 (10px)
194년 · 봄 (10px)
금 (10px)
병량 (10px)
병력 (10px)
도시 (10px)
세력 (10px)
무장 (10px)
외교 (10px)
연대기 (10px)
내정 (10px)
이번 달 + (10px)
757 (10px)
7 (10px)
행동 가능 (10px)
1 (10px)
2 (10px)
군사 (10px)
3 (10px)
인사 (10px)
4 (10px)
5 (10px)
계략 (10px)
6 (10px)
정보 (10px)
```

### WARN M7-title 11-after-turns [iphone14]

```
유비군
세력
무장
외교
연대기
내정
군사
인사
외교
계략
```

### WARN M2-간격 12-sortie [iphone14]

```
훈련 | 출진
병력 분배 | 수송
關 관우 통솔 95 병 9,000 · 훈 6 | 劉 유비 통솔 78 병 9,000 · 훈 6
劉 유비 통솔 78 병 9,000 · 훈 6 | 陳 진등 통솔 70 병 5,000 · 훈 6
```

### WARN M4-글자 12-sortie [iphone14]

```
公 (10px)
袁 (10px)
張 (10px)
孔 (10px)
呂 (10px)
曹 (10px)
劉 (10px)
王 (10px)
194년 · 봄 (10px)
금 (10px)
병량 (10px)
병력 (10px)
도시 (10px)
세력 (10px)
무장 (10px)
외교 (10px)
연대기 (10px)
```

### WARN M7-title 12-sortie [iphone14]

```
유비군
세력
무장
외교
연대기
```

### INFO M-둘러보기 [iphone14]

```
設, 勢
세력, 將
무장, 外
외교, 史
연대기, 명령 대기 도시 2, 조조군 접근, 자동, 기록, 건너뛰기
```
