// 위치(위도·경도) → 동네 이름 바꾸기에 쓰는 도우미
// OpenStreetMap의 Nominatim(주소 찾기 서비스)이 돌려주는 주소 조각으로 "여주시 가남읍"처럼 만들어요.

export type OsmAddress = Partial<
  Record<
    | "province" | "state" | "city" | "county" | "borough" | "city_district"
    | "town" | "village" | "suburb" | "quarter" | "neighbourhood" | "hamlet",
    string
  >
>;

// 시·군 + (구) + 읍·면·동 순서로 이어 붙여요. 동네(읍·면·동)를 못 찾으면 null.
export function regionFromAddress(a: OsmAddress): string | null {
  const city = a.city ?? a.county ?? a.state ?? a.province;
  const district = a.borough ?? a.city_district;
  // 읍·면(town)·동(suburb/quarter)을 먼저 쓰고, 없을 때만 더 작은 리(village)를 써요.
  const dong = a.town ?? a.suburb ?? a.quarter ?? a.village ?? a.neighbourhood ?? a.hamlet;
  if (!dong) return null;
  return [city, district && district !== city ? district : undefined, dong].filter(Boolean).join(" ").slice(0, 30);
}

// 한국 안쪽 좌표인지 대략 확인 (엉뚱한 값을 막아요)
export function isInKorea(lat: number, lng: number) {
  return lat >= 33 && lat <= 39 && lng >= 124 && lng <= 132;
}
