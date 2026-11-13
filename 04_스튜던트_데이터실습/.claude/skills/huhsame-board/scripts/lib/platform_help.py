"""OS별 안내 메시지 + 브라우저 열기."""

from __future__ import annotations

import platform
import subprocess
import webbrowser


def os_name() -> str:
    """'darwin' | 'windows' | 'linux'"""
    return platform.system().lower()


def open_browser(url: str) -> bool:
    """브라우저로 URL 열기. 성공 여부 반환."""
    try:
        # webbrowser는 크로스플랫폼 (macOS=open, Windows=start, Linux=xdg-open)
        webbrowser.open(url, new=2)
        return True
    except Exception:
        # 폴백: 명시적 OS별 명령
        try:
            name = os_name()
            if name == "darwin":
                subprocess.run(["open", url], check=False, timeout=5)
            elif name == "windows":
                subprocess.run(["cmd", "/c", "start", url], shell=False, check=False, timeout=5)
            else:
                subprocess.run(["xdg-open", url], check=False, timeout=5)
            return True
        except Exception:
            return False


def setup_screenshot_hint() -> str:
    """현재 OS에 맞는 스크린샷 안내 (이미지는 v1.1로 미뤘지만 안내는 유지)."""
    name = os_name()
    if name == "darwin":
        return (
            "스크린샷은 Cmd+Shift+4로 캡쳐 후 ~/Desktop에 저장된 파일을 사용하세요. "
            "(MVP는 이미지 미지원, 사이트에서 직접 추가 필요)"
        )
    if name == "windows":
        return (
            "스크린샷은 Win+Shift+S 후 파일 저장 또는 Win+PrintScreen으로 "
            "Pictures/Screenshots에 저장된 파일을 사용하세요. "
            "(MVP는 이미지 미지원, 사이트에서 직접 추가 필요)"
        )
    return "스크린샷 도구로 캡쳐 후 파일로 저장하세요. (MVP는 이미지 미지원)"
