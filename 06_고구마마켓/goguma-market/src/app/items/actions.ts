"use server";
// 판매글 만들기(Create) / 수정(Update) / 삭제(Delete)를 처리하는 Server Actions
// Server Action: <form action={...}>에서 바로 부르는, 서버에서만 실행되는 함수예요.
// 본인 글인지는 DB의 RLS 정책이 한 번 더 검사하므로, 남의 글은 절대 바뀌지 않아요.
// 사진 파일은 브라우저가 Storage에 먼저 올리고, 여기에는 '사진 경로'만 넘어와요.

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import {
  CONDITIONS, friendlyDbError, getCategory, MAX_PHOTOS, PHOTO_BUCKET, STATUSES, TRADE_METHODS,
  type ItemCondition, type ItemStatus, type TradeMethod,
} from "@/lib/market";

export type ItemFormState = {
  error?: string;
  fields?: Record<string, string>;
} | undefined;

// 폼에 적힌 값을 꺼내고 검사해요. 문제가 있으면 error를 돌려줘요.
// userId: 사진 경로가 정말 '내 폴더' 안의 사진인지 확인하는 데 써요.
function readForm(formData: FormData, userId: string) {
  const title = String(formData.get("title") ?? "").trim();
  const category = String(formData.get("category") ?? "");
  const priceText = String(formData.get("price") ?? "").replace(/[,\s원]/g, "");
  const description = String(formData.get("description") ?? "").trim();
  const status = String(formData.get("status") ?? "판매중");
  const photos = formData.getAll("photos").map(String);
  const acceptOffers = formData.get("acceptOffers") === "on"; // 가격 제안 받기 체크
  const condition = String(formData.get("condition") ?? "사용감 있음");
  const tradeMethod = String(formData.get("tradeMethod") ?? "직거래");
  const fields = {
    title, category, price: priceText, description, status, condition, tradeMethod,
    acceptOffers: formData.get("acceptOffers") === "on" ? "on" : "",
  };

  if (title.length < 2 || title.length > 40) return { fields, error: "제목은 2~40자로 적어 주세요." };
  if (!getCategory(category)) return { fields, error: "카테고리를 골라 주세요." };
  if (!/^\d+$/.test(priceText)) return { fields, error: "가격은 숫자로만 적어 주세요. 나눔이면 0을 적어요." };
  const price = Number(priceText);
  if (price > 100_000_000) return { fields, error: "가격은 1억 원까지 적을 수 있어요." };
  if (description.length > 2000) return { fields, error: "설명은 2000자까지 적을 수 있어요." };
  if (!STATUSES.includes(status as ItemStatus)) return { fields, error: "판매 상태를 다시 골라 주세요." };
  if (!CONDITIONS.includes(condition as ItemCondition)) return { fields, error: "상품 상태를 골라 주세요." };
  if (!TRADE_METHODS.includes(tradeMethod as TradeMethod)) return { fields, error: "거래 방법을 골라 주세요." };
  if (photos.length > MAX_PHOTOS) return { fields, error: `사진은 ${MAX_PHOTOS}장까지 올릴 수 있어요.` };
  // 사진 경로는 "내아이디/무작위이름.jpg" 모양이어야 해요. (남의 사진을 끌어다 쓰지 못하게)
  const photoPattern = new RegExp(`^${userId}/[0-9a-f-]{36}\\.jpg$`);
  if (!photos.every((p) => photoPattern.test(p))) return { fields, error: "사진 정보가 이상해요. 다시 올려 주세요." };

  return {
    fields,
    values: {
      title, category, price, description, status: status as ItemStatus, photos, accept_offers: acceptOffers,
      condition: condition as ItemCondition, trade_method: tradeMethod as TradeMethod,
    },
  };
}

// Storage에서 사진 파일을 지워요. (실패해도 글 작업은 이미 끝났으니 조용히 넘어가요)
async function removePhotos(paths: string[]) {
  if (paths.length === 0) return;
  const supabase = await createClient();
  await supabase.storage.from(PHOTO_BUCKET).remove(paths);
}

// C: 새 판매글 올리기
export async function createItem(_prev: ItemFormState, formData: FormData): Promise<ItemFormState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/write");

  const form = readForm(formData, user.id);
  if (!form.values) return { error: form.error, fields: form.fields };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("items")
    .insert({ ...form.values, status: "판매중", seller_id: user.id, region: user.region })
    .select("id")
    .single();

  if (error) return { error: friendlyDbError(error.message), fields: form.fields };

  revalidatePath("/", "layout");
  redirect(`/items/${data.id}?toast=created`);
}

// U: 판매글 고치기 (bind로 글 번호를 미리 넣어서 써요)
export async function updateItem(id: number, _prev: ItemFormState, formData: FormData): Promise<ItemFormState> {
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=/items/${id}/edit`);

  const form = readForm(formData, user.id);
  if (!form.values) return { error: form.error, fields: form.fields };

  const supabase = await createClient();
  // 고치기 전 사진 목록 (빠진 사진을 Storage에서 지우려고)
  const { data: before } = await supabase.from("items").select("photos, status").eq("id", id).eq("seller_id", user.id).maybeSingle();
  if (!before) return { error: "내 글만 고칠 수 있어요.", fields: form.fields };

  // 판매 상태는 '내가 직접 바꿨을 때만' 저장해요.
  // 수정 화면을 열어 둔 사이 채팅에서 약속이 잡혀 예약중이 됐는데, 옛 화면의 '판매중'을 그대로 저장하면
  // 약속이 몰래 취소되기 때문이에요.
  const originalStatus = String(formData.get("originalStatus") ?? "");
  const { status, ...rest } = form.values;
  const statusChanged = status !== originalStatus;
  if (statusChanged && before.status !== originalStatus)
    return { error: `그사이 판매 상태가 '${before.status}'(으)로 바뀌었어요. 새로 고친 뒤 다시 해 주세요.`, fields: form.fields };

  // seller_id 조건을 함께 걸어서 본인 글만 고쳐요. (RLS도 같은 검사를 해요)
  let query = supabase
    .from("items")
    .update(statusChanged ? form.values : rest)
    .eq("id", id)
    .eq("seller_id", user.id);
  // 상태를 바꿀 땐 '화면을 열 때 상태 그대로일 때만' 바꿔요. (아주 짧은 틈의 경쟁까지 막기)
  if (statusChanged) query = query.eq("status", originalStatus);
  const { data, error } = await query.select("id");

  if (error) return { error: friendlyDbError(error.message), fields: form.fields };
  if (!data?.length)
    return { error: statusChanged ? "그사이 판매 상태가 바뀌었어요. 새로 고친 뒤 다시 해 주세요." : "내 글만 고칠 수 있어요.", fields: form.fields };

  // 이번에 뺀 사진은 저장 공간에서도 지워요.
  const kept = new Set(form.values.photos);
  await removePhotos((before.photos as string[]).filter((p) => !kept.has(p)));

  revalidatePath("/", "layout");
  redirect(`/items/${id}?toast=updated`);
}

// D: 판매글 지우기 (사진 파일도 함께 지워요)
export async function deleteItem(id: number) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const supabase = await createClient();
  // 예약중인 글은 바로 못 지워요: 지우면 구매자의 대화방까지 말없이 사라지거든요.
  // (채팅방에서 약속을 취소하거나 상태를 바꾼 뒤 지울 수 있어요)
  const { data: cur } = await supabase.from("items").select("status").eq("id", id).eq("seller_id", user.id).maybeSingle();
  if (cur?.status === "예약중") redirect(`/items/${id}?toast=reserved_delete`);

  const { data, error } = await supabase
    .from("items")
    .delete()
    .eq("id", id)
    .eq("seller_id", user.id)
    .select("photos");
  if (error) throw new Error("글을 지우지 못했어요: " + error.message);

  await removePhotos(data.flatMap((row) => row.photos as string[]));

  revalidatePath("/", "layout");
  redirect("/?toast=deleted");
}
