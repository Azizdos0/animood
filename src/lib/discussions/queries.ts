import type { SupaLike } from "@/lib/sync/cloud";
import type { DiscussionThread, DiscussionPost } from "./types";

const THREAD_TABLE = "discussion_threads";
const POST_TABLE = "discussion_posts";
const TITLE_MAX = 200;
const BODY_MAX = 5000;

interface ThreadRow {
  id: string; media_id: number; user_id: string; title: string; body?: string;
  created_at: string; last_activity_at: string; reply_count: number;
  username: string; display_name: string | null; avatar_url: string | null;
}

interface PostRow {
  id: string; thread_id: string; user_id: string; parent_post_id: string | null;
  body: string; is_deleted: boolean; created_at: string;
  username: string; display_name: string | null; avatar_url: string | null;
}

function mapThread(r: ThreadRow): DiscussionThread {
  return {
    id: r.id, mediaId: r.media_id, userId: r.user_id, title: r.title, body: r.body,
    createdAt: r.created_at, lastActivityAt: r.last_activity_at, replyCount: Number(r.reply_count),
    username: r.username, displayName: r.display_name, avatarUrl: r.avatar_url,
  };
}

function mapPost(r: PostRow): DiscussionPost {
  return {
    id: r.id, threadId: r.thread_id, userId: r.user_id, parentPostId: r.parent_post_id,
    body: r.body, isDeleted: r.is_deleted, createdAt: r.created_at,
    username: r.username, displayName: r.display_name, avatarUrl: r.avatar_url,
  };
}

export async function listThreads(supabase: SupaLike, mediaId: number, limit = 100): Promise<DiscussionThread[]> {
  const { data, error } = await supabase.rpc("get_media_threads", { p_media_id: mediaId, p_limit: limit });
  if (error) throw error;
  const rows = (data ?? []) as ThreadRow[];
  const items: DiscussionThread[] = [];
  for (const r of rows) {
    if (!r.username) continue;
    items.push(mapThread(r));
  }
  return items;
}

export async function getThread(supabase: SupaLike, threadId: string): Promise<DiscussionThread | null> {
  const { data, error } = await supabase.rpc("get_thread", { p_thread_id: threadId });
  if (error) throw error;
  const rows = (data ?? []) as ThreadRow[];
  if (rows.length === 0) return null;
  return mapThread(rows[0]);
}

export async function createThread(
  supabase: SupaLike, userId: string, mediaId: number, title: string, body: string
): Promise<{ ok: true; id: string } | { ok: false; error: "empty" | "too_long" | "unknown" }> {
  const trimmedTitle = title.trim();
  const trimmedBody = body.trim();
  if (trimmedTitle.length === 0) return { ok: false, error: "empty" };
  if (trimmedTitle.length > TITLE_MAX) return { ok: false, error: "too_long" };
  if (trimmedBody.length === 0) return { ok: false, error: "empty" };
  if (trimmedBody.length > BODY_MAX) return { ok: false, error: "too_long" };
  const { data, error } = await supabase
    .from(THREAD_TABLE)
    .insert({ user_id: userId, media_id: mediaId, title: trimmedTitle, body: trimmedBody })
    .select("id")
    .single();
  if (error) return { ok: false, error: "unknown" };
  return { ok: true, id: (data as { id: string }).id };
}

export async function getThreadPosts(supabase: SupaLike, threadId: string): Promise<DiscussionPost[]> {
  const { data, error } = await supabase.rpc("get_thread_posts", { p_thread_id: threadId });
  if (error) throw error;
  const rows = (data ?? []) as PostRow[];
  const items: DiscussionPost[] = [];
  for (const r of rows) {
    if (!r.username) continue;
    items.push(mapPost(r));
  }
  return items;
}

export async function createPost(
  supabase: SupaLike, userId: string, threadId: string, parentPostId: string | null, body: string
): Promise<{ ok: true } | { ok: false; error: "empty" | "too_long" | "unknown" }> {
  const trimmed = body.trim();
  if (trimmed.length === 0) return { ok: false, error: "empty" };
  if (trimmed.length > BODY_MAX) return { ok: false, error: "too_long" };
  const { error } = await supabase
    .from(POST_TABLE)
    .insert({ user_id: userId, thread_id: threadId, parent_post_id: parentPostId, body: trimmed });
  if (error) return { ok: false, error: "unknown" };
  return { ok: true };
}

export async function deletePost(supabase: SupaLike, postId: string): Promise<void> {
  const { error } = await supabase.rpc("soft_delete_post", { p_post_id: postId });
  if (error) throw error;
}

export async function deleteThread(supabase: SupaLike, threadId: string): Promise<void> {
  const { error } = await supabase.from(THREAD_TABLE).delete().eq("id", threadId);
  if (error) throw error;
}
