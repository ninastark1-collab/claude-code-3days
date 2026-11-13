"use server";
// 내 정보 관리 Server Actions: 프로필 수정, 비밀번호 바꾸기/찾기, 회원 탈퇴, 알림 읽음
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import { AVATARS, PHOTO_BUCKET } from "@/lib/market";
import { isInKorea, regionFromAddress } from "@/lib/region";
import { rememberRegion } from "@/lib/geo";

export type FormState = { error?: string; message?: string } | undefined;

// 닉네임·동네·프로필 이모지 저장 (고구마 온도는 DB 규칙상 고칠 수 없어요)
export async function updateProfile(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/my/edit");

  const nickname = String(formData.get("nickname") ?? "").trim();
  const region = String(formData.get("region") ?? "").trim();
  const avatar = String(formData.get("avatar") ?? "🍠");
  if (nickname.length < 2 || nickname.length > 12) return { error: "닉네임은 2~12자로 지어 주세요." };
  if (region.length > 30) return { error: "동네 이름이 너무 길어요." };
  if (!AVATARS.includes(avatar)) return { error: "프로필 그림을 다시 골라 주세요." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({ nickname, region: region || null, avatar, show_online: formData.get("showOnline") === "on" })
    .eq("id", user.id);
  if (error) return { error: "저장하지 못했어요: " + error.message };
  // 새 동네면 위치표에 동네 중심 좌표를 적어 둬요. (근처 동네 보기에 써요)
  if (region && region !== user.region) await rememberRegion(region);

  revalidatePath("/", "layout");
  redirect("/my?toast=profile");
}

// 로그인한 상태에서 비밀번호 바꾸기 (비밀번호 찾기 메일 링크로 들어와도 여기서 바꿔요)
export async function changePassword(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/my/password");

  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("passwordConfirm") ?? "");
  if (password.length < 6) return { error: "비밀번호는 6자 이상이어야 해요." };
  if (password !== confirm) return { error: "비밀번호가 서로 달라요." };

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { error: "바꾸지 못했어요: " + error.message };
  redirect("/my?toast=password");
}

// 비밀번호 찾기: 메일로 재설정 링크를 보내요. 링크를 누르면 /auth/callback → /my/password 로 와요.
export async function requestPasswordReset(_prev: FormState, formData: FormData): Promise<FormState> {
  const email = String(formData.get("email") ?? "").trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "이메일 형식을 확인해 주세요." };

  const supabase = await createClient();
  const origin = (await headers()).get("origin") ?? "http://localhost:3000";
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${origin}/auth/callback?next=/my/password`,
  });
  // 가입 여부를 알려 주지 않으려고, 실패해도 같은 안내를 보여 줘요. (요청 한도 초과만 따로 알려요)
  if (error && error.message.toLowerCase().includes("rate limit"))
    return { error: "요청이 너무 많아요. 잠시 뒤에 다시 시도해 주세요." };
  return { message: `${email} 로 재설정 메일을 보냈어요. (가입된 이메일이면 곧 도착해요)` };
}

// 회원 탈퇴: 내가 올린 사진 파일을 지우고 → 계정을 지우면 글·댓글·채팅이 함께 지워져요.
export async function deleteAccount(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (String(formData.get("confirm") ?? "").trim() !== "탈퇴") return { error: "확인 칸에 ‘탈퇴’라고 적어 주세요." };

  const supabase = await createClient();
  // Storage 파일은 DB에서 함께 지워지지 않아요. 지울 목록을 먼저 받아 두고,
  // 계정 삭제가 '성공한 뒤에' 지워요. (실패했는데 사진만 사라져 글이 깨지지 않게)
  const { data: files } = await supabase.storage.from(PHOTO_BUCKET).list(user.id, { limit: 1000 });

  const { error } = await supabase.rpc("delete_my_goguma_account");
  if (error) return { error: "탈퇴하지 못했어요: " + error.message };
  if (files?.length) await supabase.storage.from(PHOTO_BUCKET).remove(files.map((f) => `${user.id}/${f.name}`));

  await supabase.auth.signOut({ scope: "local" });
  revalidatePath("/", "layout");
  redirect("/?toast=goodbye");
}

// 알림을 모두 읽음으로
export async function markAllNotificationsRead(upToId: number) {
  const user = await getCurrentUser();
  if (!user || !Number.isFinite(upToId)) return;
  const supabase = await createClient();
  await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("user_id", user.id)
    .is("read_at", null)
    .lte("id", upToId);
  // revalidatePath는 하지 않아요: 지금 보고 있는 알림 화면의 '새 알림' 표시가 바로 지워져 버려요.
  // (메뉴의 빨간 숫자는 실시간으로 다시 세요)
}

// ── 키워드 알림 ───────────────────────────────────

export type KeywordState = { error?: string; ok?: number } | undefined;

// 관심 키워드 추가 (최대 10개 — DB 규칙이 한 번 더 검사)
export async function addKeyword(_prev: KeywordState, formData: FormData): Promise<KeywordState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/my/keywords");

  const keyword = String(formData.get("keyword") ?? "").trim();
  if (!keyword) return { error: "키워드를 적어 주세요." };
  if (keyword.length > 20) return { error: "키워드는 20자까지 적을 수 있어요." };

  const supabase = await createClient();
  const { error } = await supabase.from("keyword_alerts").insert({ user_id: user.id, keyword });
  if (error) {
    if (error.code === "23505") return { error: "이미 등록한 키워드예요." };
    if (error.message.includes("keyword_limit")) return { error: "키워드는 10개까지 등록할 수 있어요." };
    return { error: "등록하지 못했어요: " + error.message };
  }
  revalidatePath("/my/keywords");
  return { ok: Date.now() };
}

export async function removeKeyword(keyword: string) {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/my/keywords");
  const supabase = await createClient();
  await supabase.from("keyword_alerts").delete().eq("user_id", user.id).eq("keyword", keyword);
  revalidatePath("/my/keywords");
}

// ── 위치 기반 동네 인증 ───────────────────────────────

export type RegionState = { error?: string; found?: string } | undefined;

// 휴대폰이 알려 준 위치(위도·경도)로 동네 이름을 찾아서, 내 동네로 저장하고 '인증됨'으로 표시해요.
// 동네 이름은 서버가 직접 찾아요. (브라우저가 보낸 동네 이름을 그대로 믿지 않으려고)
export async function verifyRegion(_prev: RegionState, formData: FormData): Promise<RegionState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/my/region");

  const lat = Number(formData.get("lat"));
  const lng = Number(formData.get("lng"));
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || !isInKorea(lat, lng))
    return { error: "위치를 확인하지 못했어요. 한국 안에서 위치 권한을 허용해 주세요." };

  // OpenStreetMap Nominatim: 위치 → 주소 (이용 규칙상 앱 이름을 User-Agent로 알려야 해요)
  // zoom=12: 읍·면·동 단위 (더 크게 확대하면 '태평리'처럼 리 단위가 나와요)
  const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=12&accept-language=ko&lat=${lat.toFixed(5)}&lon=${lng.toFixed(5)}`;
  let region: string | null = null;
  try {
    const res = await fetch(url, { headers: { "User-Agent": "goguma-market-study/1.0" }, cache: "no-store" });
    if (res.ok) region = regionFromAddress((await res.json()).address ?? {});
  } catch {
    // 주소 찾기 서비스가 잠시 안 될 수 있어요.
  }
  if (!region) return { error: "이 위치의 동네 이름을 찾지 못했어요. 잠시 후 다시 시도해 주세요." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({ region, region_verified_at: new Date().toISOString() })
    .eq("id", user.id);
  if (error) return { error: "저장하지 못했어요: " + error.message };
  // 동네 중심 좌표를 위치표에 (지도에서 못 찾으면 인증한 위치를 1km 단위로 뭉개서 대신 써요)
  await rememberRegion(region, { lat, lng });

  revalidatePath("/", "layout");
  redirect("/my?toast=region");
}
