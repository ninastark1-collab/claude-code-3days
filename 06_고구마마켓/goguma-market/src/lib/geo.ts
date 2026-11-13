// 근처 동네 찾기 (서버 전용)
// 동네 위치표(goguma_regions)에 "동네 이름 → 동네 중심 좌표"를 적어 두고,
// 내 동네에서 n km 안에 있는 동네 이름들을 찾아요. 사람의 실제 위치는 저장하지 않아요.
import { createClient } from "@/lib/supabase/server";
import { distanceKm } from "@/lib/market";
import { isInKorea } from "@/lib/region";

// OpenStreetMap Nominatim(주소 찾기 서비스)으로 동네 이름 → 중심 좌표.
// 행정구역(boundary)이나 지명(place)만 받아요. (예: '신의주'가 서울 순대집으로 잡히는 것 방지)
async function lookupRegion(name: string): Promise<{ lat: number; lng: number } | null> {
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&countrycodes=kr&limit=5&accept-language=ko&q=${encodeURIComponent(name)}`;
  try {
    const res = await fetch(url, { headers: { "User-Agent": "goguma-market-study/1.0" }, cache: "no-store" });
    if (!res.ok) return null;
    const hits = (await res.json()) as { category?: string; lat: string; lon: string }[];
    const hit = hits.find((h) => h.category === "boundary" || h.category === "place");
    if (!hit) return null;
    const lat = Number(hit.lat);
    const lng = Number(hit.lon);
    return isInKorea(lat, lng) ? { lat, lng } : null;
  } catch {
    return null; // 지도 서비스가 잠시 안 될 수 있어요. 그럼 다음에 다시 시도해요.
  }
}

// 내 프로필 동네를 저장한 '뒤에' 불러요. 위치표에 없으면 찾아서 한 줄 추가해요.
// fallback: 동네 인증 때 받은 위치(대략, 소수 둘째 자리 ≈ 1km)로 대신 채워요.
export async function rememberRegion(name: string | null | undefined, fallback?: { lat: number; lng: number }) {
  if (!name) return;
  const supabase = await createClient();
  const { data: known } = await supabase.from("goguma_regions").select("name").eq("name", name).maybeSingle();
  if (known) return;
  const found =
    (await lookupRegion(name)) ??
    (fallback ? { lat: Math.round(fallback.lat * 100) / 100, lng: Math.round(fallback.lng * 100) / 100 } : null);
  if (!found) return;
  // 같은 순간 다른 사람이 먼저 넣었으면(중복) 그냥 넘어가요.
  await supabase.from("goguma_regions").insert({ name, lat: found.lat, lng: found.lng });
}

// 내 동네에서 km 안의 동네 이름들 (가까운 순). 내 동네 위치를 모르면 null.
export async function nearbyRegions(name: string, km: number) {
  const supabase = await createClient();
  const { data: me } = await supabase.from("goguma_regions").select("lat, lng").eq("name", name).maybeSingle();
  if (!me) return null;
  // 먼저 네모난 범위로 대충 거르고(위도 1도 ≈ 111km), 그다음 실제 거리로 정확히 걸러요.
  const dLat = km / 111;
  const dLng = km / (111 * Math.cos((me.lat * Math.PI) / 180));
  const { data } = await supabase
    .from("goguma_regions")
    .select("name, lat, lng")
    .gte("lat", me.lat - dLat)
    .lte("lat", me.lat + dLat)
    .gte("lng", me.lng - dLng)
    .lte("lng", me.lng + dLng);
  return (data ?? [])
    .map((r) => ({ name: r.name as string, km: distanceKm(me, r) }))
    .filter((r) => r.km <= km)
    .sort((a, b) => a.km - b.km);
}
