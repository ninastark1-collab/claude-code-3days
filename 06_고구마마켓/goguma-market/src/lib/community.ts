// 동네생활 게시판 데이터를 DB에서 읽어 오는 함수들 (서버 전용)
import { connection } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getBlockedIds } from "@/lib/items";

// 주제 목록은 브라우저에서도 쓰여서 topics.ts에 따로 있어요.
import { TOPICS, topicEmoji, type Topic } from "@/lib/topics";
export { TOPICS, topicEmoji, type Topic };

export type Post = {
  id: number;
  author_id: string;
  region: string | null;
  topic: Topic;
  body: string;
  comment_count: number;
  created_at: string;
  author: { nickname: string; avatar: string } | null;
};

export type PostComment = {
  id: number;
  post_id: number;
  parent_id: number | null; // 답글이면 원댓글 번호
  is_deleted: boolean; // 답글이 달린 채 지워진 원댓글 (자리만 남아요)
  author_id: string;
  body: string;
  created_at: string;
  author: { nickname: string; avatar: string } | null;
};

const POST_COLUMNS = "*, author:profiles!community_posts_author_id_fkey(nickname, avatar)";

// 글 목록 (최근 순). 주제·동네·글쓴이로 거를 수 있고, 내가 차단한 사람의 글은 빼요.
export async function getPosts(q: { topic?: string; region?: string; authorId?: string; limit?: number; viewerId?: string }) {
  await connection();
  const supabase = await createClient();
  const limit = Math.min(Math.max(Math.floor(q.limit ?? 30) || 30, 1), 200);
  let query = supabase.from("community_posts").select(POST_COLUMNS).order("created_at", { ascending: false });
  if (q.topic) query = query.eq("topic", q.topic);
  if (q.region) query = query.eq("region", q.region);
  if (q.authorId) query = query.eq("author_id", q.authorId);
  const blocked = await getBlockedIds(q.viewerId);
  if (blocked.length) query = query.not("author_id", "in", `(${blocked.join(",")})`);
  const { data, error } = await query.limit(limit + 1);
  if (error) throw new Error("동네생활 글을 불러오지 못했어요: " + error.message);
  const rows = (data ?? []) as Post[];
  return { posts: rows.slice(0, limit), hasMore: rows.length > limit };
}

export async function getPost(id: string) {
  if (!/^\d+$/.test(id)) return null;
  await connection();
  const supabase = await createClient();
  const { data } = await supabase.from("community_posts").select(POST_COLUMNS).eq("id", Number(id)).maybeSingle();
  return data as Post | null;
}

export async function getPostComments(postId: number) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("community_comments")
    .select("*, author:profiles!community_comments_author_id_fkey(nickname, avatar)")
    .eq("post_id", postId)
    .order("created_at", { ascending: true })
    .limit(300);
  if (error) throw new Error("댓글을 불러오지 못했어요: " + error.message);
  return (data ?? []) as PostComment[];
}
