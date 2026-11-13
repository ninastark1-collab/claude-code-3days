"""토큰 로드/저장 헬퍼."""

from __future__ import annotations

import os
from pathlib import Path

TOKEN_PATH = Path.home() / ".config" / "huhsame" / "token"


def load_token() -> str | None:
    """저장된 토큰 읽기. 없으면 None."""
    if not TOKEN_PATH.exists():
        return None
    try:
        token = TOKEN_PATH.read_text().strip()
        return token or None
    except OSError:
        return None


def save_token(token: str) -> None:
    """토큰 저장 (chmod 600)."""
    TOKEN_PATH.parent.mkdir(parents=True, exist_ok=True)
    # 부모 디렉토리도 본인만 접근 (700)
    os.chmod(TOKEN_PATH.parent, 0o700)
    # 토큰 파일을 0600으로 atomic 생성 — write_text→chmod 사이 race window 제거
    fd = os.open(TOKEN_PATH, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "w") as f:
        f.write(token + "\n")


def clear_token() -> None:
    """토큰 삭제 (revoked/expired 시)."""
    if TOKEN_PATH.exists():
        TOKEN_PATH.unlink()
