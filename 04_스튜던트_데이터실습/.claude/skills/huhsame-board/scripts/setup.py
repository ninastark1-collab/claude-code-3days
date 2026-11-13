#!/usr/bin/env python3
"""
huhsame-board 디바이스 코드 setup.

1. POST /api/cli/init → user_code + device_code 받음
2. 브라우저 자동 열기 (verification_url)
3. user_code 사용자에게 안내
4. 5초 간격으로 POST /api/cli/poll (최대 10분)
5. access_token 받으면 ~/.config/huhsame/token 에 저장 (chmod 600)
"""

from __future__ import annotations

import platform
import sys
import time

# 윈도우 콘솔(cp949)에서도 한글·이모지 출력이 깨지지 않게.
# line_buffering: Claude Code가 파이프로 읽을 때 승인 코드가 폴링 끝날 때까지 안 보이는 것 방지
for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8", line_buffering=True)
    except (AttributeError, ValueError):
        pass

sys.path.insert(0, str(__import__("pathlib").Path(__file__).resolve().parent))

from lib import api  # noqa: E402
from lib.auth import save_token  # noqa: E402
from lib.platform_help import open_browser  # noqa: E402


def device_label() -> str:
    """Claude Code (macOS, 호스트명)"""
    sysname = platform.system()
    host = platform.node().split(".")[0]
    return f"Claude Code ({sysname}, {host})"[:80]


def main() -> int:
    print("🔌 huhsame.com 연결 시작…")

    try:
        result = api.init_device(device_label=device_label())
    except RuntimeError as e:
        print(f"❌ 초기화 실패: {e}", file=sys.stderr)
        return 1

    user_code = result["user_code"]
    device_code = result["device_code"]
    verification_url = result["verification_url"]
    interval = result.get("interval", 5)
    expires_in = result.get("expires_in", 600)

    print()
    print(f"📋 코드:  {user_code}")
    print(f"🌐 URL:   {verification_url}")
    print()

    opened = open_browser(verification_url)
    if opened:
        print("브라우저를 열었어요. 페이지에서 위 코드가 같은지 확인하고 '승인'을 눌러주세요.")
    else:
        print("브라우저 자동 열기 실패. 위 URL을 직접 여세요.")
    print()
    print(f"승인 대기 중… (최대 {expires_in // 60}분)")

    deadline = time.time() + expires_in
    while time.time() < deadline:
        time.sleep(interval)
        status, body = api.poll(device_code)

        if status == 200 and body.get("access_token"):
            save_token(body["access_token"])
            course_count = body.get("course_count", 0)
            print()
            print(f"✅ 연결 완료! (수강 등록된 강의: {course_count}개)")
            print("토큰 저장 위치: ~/.config/huhsame/token (chmod 600)")
            return 0

        error = body.get("error")
        if error == "authorization_pending":
            # 정상. 계속 폴링
            continue
        if error == "expired_token":
            print("❌ 시간 초과. 다시 시작해주세요.", file=sys.stderr)
            return 1
        if error == "invalid_grant":
            print("❌ 인증 코드가 무효합니다. 다시 시작해주세요.", file=sys.stderr)
            return 1

        # 그 외 에러
        print(f"⚠️  예상치 못한 응답 (status={status}): {body}", file=sys.stderr)

    print("❌ 시간 초과 (10분).", file=sys.stderr)
    return 1


if __name__ == "__main__":
    sys.exit(main())
