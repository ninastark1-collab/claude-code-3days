// 동네생활 주제 목록 (브라우저·서버 어디서나 쓰는 값이라 서버 전용 파일과 따로 둬요)
export const TOPICS = [
  { value: "일상", emoji: "☀️" },
  { value: "질문", emoji: "❓" },
  { value: "맛집", emoji: "🍲" },
  { value: "분실·실종", emoji: "🔎" },
  { value: "동네소식", emoji: "📢" },
] as const;
export type Topic = (typeof TOPICS)[number]["value"];

export function topicEmoji(topic: string) {
  return TOPICS.find((t) => t.value === topic)?.emoji ?? "🌾";
}
