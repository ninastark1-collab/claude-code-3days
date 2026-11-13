// 아이폰 '홈 화면에 추가' 아이콘
import { ImageResponse } from "next/og";
import { GogumaIconArt } from "./goguma-icon";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(<GogumaIconArt size={180} />, size);
}
