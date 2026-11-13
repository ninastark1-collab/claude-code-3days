"""어느 강의 게시판에 올릴지 고른다 (2026-09-11 세임 지시).

규칙
1. 오늘(한국 시간) 수업이 있는 강의가 딱 1개 → 그 강의 (mode="today")
2. 오늘 수업이 없거나 여러 개 → 가장 최근 강의 (mode="recent")
   - "최근" = 수업일이 오늘에 가장 가까운 것. 거리가 같으면 지나간/진행 중인 쪽을 앞으로 올 쪽보다 우선.
   - 오늘 수업이 여러 개면 이미 시작한 수업 중 가장 늦게 시작한 것, 아직 아무것도 안 시작했으면 가장 먼저 시작할 것.
3. 그래도 못 정하면 (게시판 강의 0개, 날짜 정보 없음, 완전 동률) → 사용자에게 묻는다 (mode="ask" / "none")

수업일은 세션(course_sessions) 시작 시각이 정본이고, 세션이 없으면 강의 시작일·종료일(courses.date/end_date)을 쓴다.
구버전 서버(날짜 필드 없음)면 last_session_at 하나만 쓴다.
"""

from __future__ import annotations

import re
from datetime import date, datetime, timedelta, timezone
from typing import Any

# 한국은 서머타임이 없어서 고정 오프셋으로 충분하다 (윈도우 파이썬엔 zoneinfo 데이터가 없을 수 있음)
KST = timezone(timedelta(hours=9))


def parse_ts(value: str | None) -> datetime | None:
    if not value:
        return None
    # 파이썬 3.10 이하 fromisoformat은 "Z"·"+00"·소수 자릿수 들쭉날쭉을 못 읽어서 먼저 다듬는다
    text = value.strip().replace(" ", "T").replace("Z", "+00:00")
    text = re.sub(r"\.\d+", "", text)
    text = re.sub(r"(T[\d:]+[+-]\d\d)$", r"\1:00", text)
    try:
        dt = datetime.fromisoformat(text)
    except ValueError:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(KST)


def class_days(course: dict[str, Any]) -> list[tuple[date, datetime | None]]:
    """강의의 수업일 목록 [(KST 날짜, 시작 시각 or None)]."""
    starts: list[datetime | None] = []
    for s in course.get("sessions") or []:
        dt = parse_ts(s.get("start_time"))
        if dt:
            starts.append(dt)

    days: dict[date, datetime | None] = {}
    if starts:
        for dt in starts:
            prev = days.get(dt.date())
            days[dt.date()] = dt if prev is None else min(prev, dt)
    else:
        start = parse_ts(course.get("course_start"))
        end = parse_ts(course.get("course_end"))
        if start:
            days[start.date()] = start
        if end and end.date() not in days:
            # 종료일은 수업 시작 시각을 모른다
            days[end.date()] = None
        if not days:
            legacy = parse_ts(course.get("last_session_at"))
            if legacy:
                days[legacy.date()] = legacy
    return sorted(days.items())


def _rank(day: date, start: datetime | None, today: date, now: datetime) -> tuple:
    """작을수록 '가장 최근'. 완전히 같으면 동률."""
    delta = (day - today).days
    future = 1 if delta > 0 else 0
    if delta == 0:
        # 오늘: 이미 시작한 수업 우선, 그 안에서는 늦게 시작한 것(=지금 진행 중일 가능성 큼)
        started = 0 if (start is None or start <= now) else 1
    else:
        started = 0
    time_gap = abs((now - start).total_seconds()) if start else float("inf")
    return (abs(delta), future, started, time_gap)


def select_course(
    enrolled: list[dict[str, Any]], today: date, now: datetime
) -> dict[str, Any]:
    def brief(course: dict[str, Any], day: date | None = None) -> dict[str, Any]:
        out = {
            "course_id": course.get("course_id"),
            "title": course.get("title"),
            "slug": course.get("slug"),
        }
        if day:
            out["class_day"] = day.isoformat()
        return out

    if not enrolled:
        return {
            "mode": "none",
            "course": None,
            "reason": "게시판이 있는 수강 강의가 없어요.",
            "candidates": [],
        }

    today_courses = [c for c in enrolled if any(d == today for d, _ in class_days(c))]
    if len(today_courses) == 1:
        c = today_courses[0]
        return {
            "mode": "today",
            "course": brief(c, today),
            "reason": f"오늘({today.isoformat()}) 수업이 있는 강의라 자동 선택했어요.",
            "candidates": [],
        }

    pool = today_courses if today_courses else enrolled
    ranked = []
    for c in pool:
        days = class_days(c)
        if not days:
            continue
        best = min((_rank(d, s, today, now), d) for d, s in days)
        ranked.append((best[0], best[1], c))

    candidates = [brief(c) for c in enrolled]
    if not ranked:
        return {
            "mode": "ask",
            "course": None,
            "reason": "강의 날짜 정보가 없어서 어느 강의인지 정하지 못했어요.",
            "candidates": candidates,
        }

    ranked.sort(key=lambda r: r[0])
    if len(ranked) > 1 and ranked[0][0] == ranked[1][0]:
        return {
            "mode": "ask",
            "course": None,
            "reason": "가장 가까운 수업일이 같은 강의가 여러 개라 정하지 못했어요.",
            "candidates": [brief(r[2], r[1]) for r in ranked],
        }

    _, day, c = ranked[0]
    if today_courses:
        why = f"오늘 수업이 {len(today_courses)}개라 지금 시각에 가장 가까운 강의를 골랐어요."
    elif day < today:
        why = f"오늘 수업은 없어서 가장 최근 수업일({day.isoformat()}) 강의를 골랐어요."
    else:
        why = f"오늘 수업은 없어서 가장 가까운 수업일({day.isoformat()}) 강의를 골랐어요."
    return {"mode": "recent", "course": brief(c, day), "reason": why, "candidates": []}
