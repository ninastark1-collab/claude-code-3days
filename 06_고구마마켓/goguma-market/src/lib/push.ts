// 푸시 알림 공용 값 (브라우저에서 써요)
// VAPID 공개 열쇠: "이 알림은 고구마마켓이 보낸 것"임을 확인하는 열쇠 쌍 중 공개용이에요. (비밀 열쇠는 Supabase 금고에만 있어요)
export const VAPID_PUBLIC_KEY =
  "BE7ABIT7biTJDEbA7CmTLvaGk_NLg_iM47BNeac_bGcvlc-dGo6JqFuWJ_i1HxC_8Tkox2He9Fdd3n_0BHtLNdY";

// 브라우저가 원하는 모양(바이트 배열)으로 바꾸기
export function keyToBytes(base64url: string) {
  const pad = "=".repeat((4 - (base64url.length % 4)) % 4);
  const raw = atob((base64url + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

// 이 기기의 지금 구독(없으면 null)
export async function currentSubscription() {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return null;
  const reg = await navigator.serviceWorker.getRegistration("/");
  return (await reg?.pushManager.getSubscription()) ?? null;
}
