// 브라우저에서 사진을 줄이고 Supabase Storage에 올리는 도구
// 사진 10장을 서버(Server Action)로 보내면 용량 한도(1MB)를 넘기 때문에,
// 브라우저가 사진을 직접 Storage에 올리고, 판매글에는 '사진 경로'만 저장해요.

import { createClient } from "@/lib/supabase/client";
import { PHOTO_BUCKET } from "@/lib/market";

const MAX_SIDE = 1600; // 긴 쪽을 이 크기(px)까지 줄여요. 휴대폰 사진(4000px 이상)도 가볍게!

// 사진을 JPG로 다시 그려서 크기와 용량을 줄여요. (휴대폰 사진의 회전 정보도 반영)
export async function compressImage(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("사진을 줄이지 못했어요."))), "image/jpeg", 0.85),
  );
}

// 줄인 사진을 '내 아이디' 폴더에 올리고, 저장된 경로를 돌려줘요.
export async function uploadPhoto(blob: Blob): Promise<string> {
  const supabase = createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) throw new Error("로그인이 풀렸어요. 다시 로그인해 주세요.");

  // 파일 이름은 겹치지 않게 무작위로 지어요.
  const path = `${data.user.id}/${crypto.randomUUID()}.jpg`;
  const { error } = await supabase.storage.from(PHOTO_BUCKET).upload(path, blob, { contentType: "image/jpeg" });
  if (error) throw new Error("사진을 올리지 못했어요: " + error.message);
  return path;
}
