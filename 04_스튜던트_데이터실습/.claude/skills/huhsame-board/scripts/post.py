#!/usr/bin/env python3
"""
huhsame-board 게시글 작성.

흐름:
1. 토큰 로드 (없으면 종료 코드 2, 만료면 3)
2. GET /api/cli/me/active-course → 수강 강의 목록 + 날짜
3. 강의 자동 선택 (lib/select_course.py — 오늘 강의 → 가장 최근 강의 → 질문)
4. GET /api/cli/me/sections/[course_id] → 섹션 + cli_post_guide

이 스크립트 자체는 *데이터 fetch만* 한다. 글 정리(제목/본문/섹션 추정)는
Claude가 스킬 호출 흐름 안에서 처리하고, 최종 POST는 별도로 호출.

사용 모드:
- `--check`: 토큰 유효성만 체크 (종료 코드로 시그널)
- `--fetch`: 선택된 강의 + 섹션 정보를 JSON으로 stdout에 출력
- `--fetch-sections <course_id>`: 사용자가 다른 강의를 골랐을 때 그 강의 섹션
- `--post <json>`: 사용자 확인 후 실제 POST (Claude가 만든 페이로드 전달)
- `--today YYYY-MM-DD` (또는 env HUHSAME_TODAY): 날짜 덮어쓰기 — 테스트용
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import date, datetime
from pathlib import Path

# 윈도우 콘솔(cp949)에서도 한글·이모지 출력이 깨지지 않게
for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8")
    except (AttributeError, ValueError):
        pass

sys.path.insert(0, str(Path(__file__).resolve().parent))

from lib import api  # noqa: E402
from lib.auth import clear_token, load_token  # noqa: E402
from lib.select_course import KST, select_course  # noqa: E402


def resolve_now(today_arg: str | None) -> tuple[date, datetime]:
    """오늘 날짜(KST)와 지금 시각. --today/HUHSAME_TODAY가 있으면 날짜만 바꾸고 시각은 지금 그대로."""
    now = datetime.now(KST)
    override = today_arg or os.environ.get("HUHSAME_TODAY")
    if override:
        day = date.fromisoformat(override)
        now = now.replace(year=day.year, month=day.month, day=day.day)
    return now.date(), now


def cmd_check() -> int:
    token = load_token()
    if not token:
        return 2

    try:
        api.get_active_course(token)
        return 0
    except PermissionError:
        clear_token()
        return 3
    except RuntimeError as e:
        print(f"⚠️  체크 실패: {e}", file=sys.stderr)
        return 1


def cmd_fetch(today_arg: str | None) -> int:
    token = load_token()
    if not token:
        print(json.dumps({"error": "no_token"}))
        return 2

    try:
        active = api.get_active_course(token)
    except PermissionError:
        clear_token()
        print(json.dumps({"error": "token_revoked"}))
        return 3
    except RuntimeError as e:
        print(json.dumps({"error": str(e)}))
        return 1

    today, now = resolve_now(today_arg)
    enrolled = active.get("enrolled", [])
    selection = select_course(enrolled, today, now)

    # 자동 선택된 강의의 섹션만 받는다 (질문 모드면 사용자가 고른 뒤 --fetch-sections)
    sections: list = []
    sections_error = None
    if selection["course"]:
        try:
            sections = api.get_sections(token, selection["course"]["course_id"])
        except PermissionError:
            clear_token()
            print(json.dumps({"error": "token_revoked"}))
            return 3
        except RuntimeError as e:
            sections_error = str(e)

    output = {
        "today": today.isoformat(),
        "selection": selection,
        "sections": sections,
        "sections_error": sections_error,
        "enrolled": [
            {k: c.get(k) for k in ("course_id", "title", "slug")} for c in enrolled
        ],
        "server_time": active.get("server_time"),
    }
    print(json.dumps(output, ensure_ascii=False))
    return 0


def cmd_fetch_sections(course_id: str) -> int:
    """특정 강의의 섹션만 fetch (사용자가 enrolled에서 선택했을 때)."""
    token = load_token()
    if not token:
        print(json.dumps({"error": "no_token"}))
        return 2

    try:
        sections = api.get_sections(token, course_id)
    except PermissionError:
        clear_token()
        print(json.dumps({"error": "token_revoked"}))
        return 3
    except RuntimeError as e:
        print(json.dumps({"error": str(e)}))
        return 1

    print(json.dumps(sections, ensure_ascii=False))
    return 0


def cmd_post(payload_json: str) -> int:
    token = load_token()
    if not token:
        print(json.dumps({"error": "no_token"}))
        return 2

    try:
        payload = json.loads(payload_json)
    except json.JSONDecodeError as e:
        print(json.dumps({"error": f"invalid_json: {e}"}))
        return 1

    required = ["course_id", "section_id", "post_type", "content"]
    missing = [k for k in required if not payload.get(k)]
    if missing:
        print(json.dumps({"error": f"missing: {missing}"}))
        return 1

    post_type = payload["post_type"]
    if post_type not in ("text", "code"):
        print(json.dumps({"error": "post_type must be text or code (MVP)"}))
        return 1

    try:
        result = api.create_post(
            token,
            payload["course_id"],
            section_id=payload["section_id"],
            post_type=post_type,
            title=payload.get("title"),
            content=payload["content"],
            content_format=payload.get("content_format", "markdown"),
            code_content=payload.get("code_content"),
            code_language=payload.get("code_language"),
        )
    except PermissionError:
        clear_token()
        print(json.dumps({"error": "token_revoked"}))
        return 3
    except RuntimeError as e:
        print(json.dumps({"error": str(e)}))
        return 1

    # 게시글 URL 구성
    base = api.base_url()
    url = f"{base}/courses/{payload['course_id']}/board"
    if "id" in result:
        url += f"?post={result['id']}"
    result["url"] = url
    print(json.dumps(result, ensure_ascii=False))
    return 0


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    parser.add_argument("--fetch", action="store_true")
    parser.add_argument("--fetch-sections", type=str, default=None, metavar="COURSE_ID")
    parser.add_argument("--post", type=str, default=None, metavar="JSON")
    # 윈도우 셸은 한글·줄바꿈이 든 JSON 인자 따옴표가 잘 깨져서 파일로 넘기는 쪽을 권장
    parser.add_argument("--post-file", type=str, default=None, metavar="PATH")
    parser.add_argument("--today", type=str, default=None, metavar="YYYY-MM-DD")
    args = parser.parse_args()

    if args.check:
        return cmd_check()
    if args.fetch:
        return cmd_fetch(args.today)
    if args.fetch_sections:
        return cmd_fetch_sections(args.fetch_sections)
    if args.post_file:
        # utf-8-sig: 윈도우 편집기가 붙이는 BOM이 있어도 읽힌다
        return cmd_post(Path(args.post_file).read_text(encoding="utf-8-sig"))
    if args.post:
        return cmd_post(args.post)

    parser.print_help()
    return 1


if __name__ == "__main__":
    sys.exit(main())
