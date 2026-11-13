// 브라우저 탭·홈 화면에 쓰는 앱 아이콘 (PNG로 만들어져요)
import { ImageResponse } from "next/og";
import { GogumaIconArt } from "./goguma-icon";

export const size = { width: 512, height: 512 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(<GogumaIconArt size={512} />, size);
}
