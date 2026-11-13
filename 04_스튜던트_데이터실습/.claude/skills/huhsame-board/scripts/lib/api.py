"""huhsame.com API 호출 래퍼."""

from __future__ import annotations

import json
import os
import urllib.error
import urllib.request
from typing import Any


def base_url() -> str:
    """사이트 base URL. env로 override 가능 (테스트용)."""
    return os.environ.get("HUHSAME_BASE_URL", "https://huhsame.com").rstrip("/")


def _request(
    method: str,
    path: str,
    *,
    token: str | None = None,
    body: dict | None = None,
) -> tuple[int, dict[str, Any]]:
    """HTTP request. 응답은 (status, json) 튜플."""
    url = base_url() + path
    data = json.dumps(body).encode() if body is not None else None
    headers = {
        "Accept": "application/json",
        "User-Agent": "huhsame-board-cli/1.0",
    }
    if body is not None:
        headers["Content-Type"] = "application/json"
    if token:
        headers["Authorization"] = f"Bearer {token}"

    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            payload = resp.read().decode()
            return resp.status, json.loads(payload) if payload else {}
    except urllib.error.HTTPError as e:
        try:
            payload = e.read().decode()
            return e.code, json.loads(payload) if payload else {"error": str(e)}
        except (json.JSONDecodeError, OSError):
            return e.code, {"error": str(e)}
    except urllib.error.URLError as e:
        return 0, {"error": f"network: {e.reason}"}


def init_device(device_label: str | None = None) -> dict:
    """POST /api/cli/init"""
    status, data = _request("POST", "/api/cli/init", body={"device_label": device_label})
    if status not in (200, 201):
        raise RuntimeError(f"init 실패 (status={status}): {data.get('error', data)}")
    return data


def poll(device_code: str) -> tuple[int, dict]:
    """POST /api/cli/poll. (status, body) 그대로 반환 (호출자가 분기)."""
    return _request("POST", "/api/cli/poll", body={"device_code": device_code})


def get_active_course(token: str) -> dict:
    """GET /api/cli/me/active-course"""
    status, data = _request("GET", "/api/cli/me/active-course", token=token)
    if status == 401:
        raise PermissionError("토큰 만료/revoke")
    if status != 200:
        raise RuntimeError(f"active-course 실패: {data.get('error', data)}")
    return data


def get_sections(token: str, course_id: str) -> list[dict]:
    """GET /api/cli/me/sections/[courseId]"""
    status, data = _request(
        "GET", f"/api/cli/me/sections/{course_id}", token=token
    )
    if status == 401:
        raise PermissionError("토큰 만료/revoke")
    if status != 200:
        raise RuntimeError(f"sections 실패: {data}")
    return data if isinstance(data, list) else []


def create_post(
    token: str,
    course_id: str,
    *,
    section_id: str,
    post_type: str,
    title: str | None,
    content: str | None,
    content_format: str = "markdown",
    code_content: str | None = None,
    code_language: str | None = None,
) -> dict:
    """POST /api/courses/[id]/board/posts (Bearer 인증)"""
    body = {
        "section_id": section_id,
        "post_type": post_type,
        "title": title,
        "content": content,
        "content_format": content_format,
    }
    if post_type == "code":
        body["code_content"] = code_content
        body["code_language"] = code_language

    status, data = _request(
        "POST", f"/api/courses/{course_id}/board/posts", token=token, body=body
    )
    if status == 401:
        raise PermissionError("토큰 만료/revoke")
    if status not in (200, 201):
        raise RuntimeError(f"post 실패 (status={status}): {data.get('error', data)}")
    return data
