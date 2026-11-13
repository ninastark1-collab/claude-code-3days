# 클로드 코드 3일 작업 모음 (2026-11-11 ~ 11-13)

Claude Code로 3일 동안 만든 프로젝트 8개를 한곳에 모은 저장소입니다.
다른 컴퓨터에서 이 저장소 하나만 받으면 모든 작업을 이어서 할 수 있어요.

## 다른 컴퓨터에서 가져오기

```bash
git clone https://github.com/ninastark1-collab/claude-code-3days.git
cd claude-code-3days
```

또는 Claude Code에 "이 깃허브 링크 받아서 ○○ 프로젝트 실행해줘" 라고 링크를 주면 됩니다.

> 필요한 프로그램: [Git](https://git-scm.com), [Node.js LTS](https://nodejs.org) (삼국지·브레이크포트·포커·고구마마켓), Python 3 (스튜던트 실습 일부)
> 비공개 저장소라서 처음에 GitHub 로그인(`gh auth login`)이 필요할 수 있어요.

## 완성품 바로 받기 (설치 파일)

[Releases 페이지](https://github.com/ninastark1-collab/claude-code-3days/releases)에 빌드된 결과물이 있어요.

| 파일 | 내용 |
| --- | --- |
| `samgukji-setup-0.6.2.exe` | 삼국지 천하쟁패 윈도우 설치 파일 |
| `samgukji-0.6.2-debug.apk` | 삼국지 천하쟁패 안드로이드 앱 |
| `monster-class.apk` | 몬스터 클래스(브레이크포트) 안드로이드 앱 |

## 프로젝트 목록

| # | 폴더 | 무엇 | 기술 | 실행 |
| --- | --- | --- | --- | --- |
| 1 | [01_삼국지_천하쟁패](01_삼국지_천하쟁패) | 삼국지 전략 게임 (PC + 모바일), 설계노트·QA 체크리스트·BGM 포함 | Vite, TypeScript, Electron, Capacitor | `npm install` → `npm run dev` |
| 2 | [02_브레이크포트](02_브레이크포트) | 몬스터 클래스: 실시간 1:1 카드 배치 타워 공성 게임 | Vite, TypeScript, WebSocket 서버 | `npm install` → `npm run dev` |
| 3 | [03_포커](03_포커) | 기억력 포커 (온라인 대전) | Vite, Supabase | `npm install` → `cp .env.example .env` → `npm run dev` |
| 4 | [04_스튜던트_데이터실습](04_스튜던트_데이터실습) | 바이브코딩 수업 실습: 매출 데이터 클리닝·통합 엑셀·대시보드, 실습 기록 | Python, HTML | `2026_매출_대시보드.html`, `클로드코드_실습기록.html` 더블클릭 |
| 5 | [05_가계부](05_가계부) | 파일 하나짜리 가계부 (Supabase 저장) | HTML, Supabase | `index.html` 더블클릭 / [배포본](https://ninastark1-collab.github.io/money-ledger/) |
| 6 | [06_고구마마켓](06_고구마마켓/goguma-market) | 동네 중고거래 앱 (회원가입, 물건 등록, 푸시 알림) | Next.js, Supabase | `npm install` → `cp .env.example .env.local` → `npm run dev` |
| 7 | [07_쇼핑몰_몽글](07_쇼핑몰_몽글) | 책임 분양 펫샵 쇼핑몰 데모 | HTML/CSS/JS | `index.html` 더블클릭 |
| 8 | [08_game](08_game) | 몽글몽글 가위바위보 | HTML | `index.html` 더블클릭 |

각 폴더 안의 `README.md`, `CLAUDE.md`, 설계 문서(.md)에 자세한 내용이 있어요.

## 주요 문서

- 삼국지: [게임마스터_설계노트](01_삼국지_천하쟁패/게임마스터_설계노트.md), [전투개편 v2 설계서](01_삼국지_천하쟁패/전투개편_v2_전례기반_설계서.md), [개발자 전달서](01_삼국지_천하쟁패/개발자_전달서.md), [음향 BGM 큐시트](01_삼국지_천하쟁패/음향_BGM_큐시트.md), [QA 폴더](01_삼국지_천하쟁패/qa)
- 브레이크포트: [설치·배포 안내](02_브레이크포트/docs/INSTALL.md), [QA 체크리스트](02_브레이크포트/QA_CHECKLIST.md), [프리모템](02_브레이크포트/docs/PREMORTEM.md)
- 포커: [테스트보고서](03_포커/테스트보고서.md)
- 쇼핑몰: [개선 내역](07_쇼핑몰_몽글/IMPROVEMENTS.md)

## 이 저장소에 넣지 않은 것

| 빠진 것 | 이유 / 되살리는 법 |
| --- | --- |
| `node_modules`, `.venv` | 용량이 큼. `npm install` (Python은 `python -m venv .venv` 후 필요한 패키지 설치) |
| `dist`, `release`, `build`, `.next` | 빌드 결과물. `npm run build` 등으로 다시 생성. 설치 파일은 Releases에 있음 |
| `.env.local` 의 `VERCEL_OIDC_TOKEN` | 임시 토큰. 필요하면 `vercel link` → `vercel env pull` |
| `.vercel`, `.claude/settings.local.json` | 이 컴퓨터 전용 설정 |

Supabase 키는 모두 **공개용(publishable) 키**만 들어 있어요. 비밀 키(service_role)는 Supabase 대시보드에만 있습니다.

## 원래 따로 있던 저장소

이 모음과 별개로 아래 저장소도 그대로 있어요 (배포는 각 저장소/Vercel에서 계속):
- 가계부: https://github.com/ninastark1-collab/money-ledger
- 고구마마켓: https://github.com/ninastark1-collab/goguma-market
- 쇼핑몰 몽글: https://github.com/ninastark1-collab/mongle
