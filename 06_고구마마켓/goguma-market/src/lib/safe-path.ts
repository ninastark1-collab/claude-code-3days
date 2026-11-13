// 작업이 끝나고 '돌아갈 주소'가 우리 사이트 안의 경로인지 확인해요.
// '//다른사이트.com' 이나 '/\다른사이트.com' 은 브라우저가 바깥 사이트로 보내서 막아요.
export function isSafePath(path: string) {
  return path.startsWith("/") && !path.startsWith("//") && !path.startsWith("/\\");
}

export function safePath(path: string | null | undefined, fallback = "/") {
  return path && isSafePath(path) ? path : fallback;
}
