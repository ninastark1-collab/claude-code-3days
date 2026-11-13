"use client";
// 알림 화면이 열리면 한 번, 내 알림을 모두 '읽음'으로 바꿔요.
// (화면은 이미 그려졌으니 새로 고치지 않고, 다음에 열 때부터 빨간 점이 사라져요)
import { useEffect } from "react";
import { markAllNotificationsRead } from "@/app/my/actions";

// upToId: 화면에 그린 알림 중 가장 최근 번호. 그 사이 새로 온 알림은 '안 읽음'으로 남겨요.
export default function MarkNotificationsRead({ upToId }: { upToId: number }) {
  useEffect(() => {
    markAllNotificationsRead(upToId);
  }, [upToId]);
  return null;
}
