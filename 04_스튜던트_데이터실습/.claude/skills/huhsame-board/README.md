# huhsame-board

허세임 강의 수강생이 Claude Code에서 강의 게시판에 글을 올리는 스킬.

> **정본은 이 폴더(`~/.claude/skills/huhsame-board/`)**. 강의 실습 폴더(`courses/*/실습/.claude/skills/huhsame-board/`)에 넣는 건 사본이다 — 여기서 고치고 사본을 다시 복사한다 (README·`__pycache__`는 복사하지 않음).

## 빠른 시작

1. Claude Code에서 `"이거 게시판에 올려줘"` 같이 말함
2. 토큰 없으면 자동 setup (브라우저 한 번 클릭)
3. 강의 자동 선택 (오늘 수업 → 가장 가까운 수업일 → 못 정하면 질문) · 섹션 자동 선택 (확신 낮을 때만 질문)
4. 글 정리 → 미리보기 → 확인 → 발행

## 강의 자동 선택 테스트

```bash
python3 scripts/post.py --fetch --today 2026-09-12   # 또는 HUHSAME_TODAY=2026-09-12
```

규칙 코드는 `scripts/lib/select_course.py`. 서버 `GET /api/cli/me/active-course`의 `enrolled[]`에
`course_start`·`course_end`·`sessions`가 있어야 한다 (huhsame-ai d5a5ad1, 2026-09-11). admin 계정은 게시판 강의 전체가 온다.

## 파일 구조

```
huhsame-board/
├── SKILL.md                 # Claude가 읽는 스킬 진입점
├── README.md                # 이 파일
├── scripts/
│   ├── setup.py             # 디바이스 코드 flow 실행
│   ├── post.py              # 글 작성 (check/fetch/fetch-sections/post-file 명령)
│   └── lib/
│       ├── auth.py          # 토큰 로드/저장
│       ├── api.py           # huhsame API 호출
│       ├── select_course.py # 강의 자동 선택 규칙
│       └── platform_help.py # OS별 안내
└── prompts/
    └── post-drafting.md     # Claude에게 주는 글 정리 가이드
```

## 토큰 위치

`~/.config/huhsame/token` (chmod 600)

해지하려면: 사이트 마이페이지 → "Claude Code 연결" → revoke 또는 파일 직접 삭제.

## 환경변수

- `HUHSAME_BASE_URL` — 기본 `https://huhsame.com`. 로컬 테스트 시 `http://localhost:3000`

## 디자인 spec

전체 설계: `huhsame-ai/docs/superpowers/specs/2026-05-24-huhsame-board-cli-skill-design.md`
