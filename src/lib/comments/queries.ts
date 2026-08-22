import type { SupaLike } from "@/lib/sync/cloud";
import type { CommentItem } from "./types";

const TABLE = "comments";
const MAX = 2000;

interface Row {
  id: string; media_id: number; user_id: string; body: string; created_at: string;
  profiles: { username: string; display_name: string | null; avatar_url: string | null } | null;
}

export async function listComments(supabase: SupaLike, mediaId: number, limit = 100): Promise<CommentItem[]> {
  const { data, error } = await supabase.from(TABLE)
    .select("id, media_id, user_id, body, created_at, profiles(username, display_name, avatar_url)")
    .eq("media_id", mediaId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  const rows = (data ?? []) as Row[];
  const items: CommentItem[] = [];
  for (const r of rows) {
    if (!r.profiles) continue;
    items.push({
      id: r.id, mediaId: r.media_id, userId: r.user_id,
      username: r.profiles.username, displayName: r.profiles.display_name, avatarUrl: r.profiles.avatar_url,
      body: r.body, createdAt: r.created_at,
    });
  }
  return items;
}

export async function addComment(
  supabase: SupaLike, userId: string, mediaId: number, body: string
): Promise<{ ok: true } | { ok: false; error: "empty" | "too_long" | "unknown" }> {
  const trimmed = body.trim();
  if (trimmed.length === 0) return { ok: false, error: "empty" };
  if (trimmed.length > MAX) return { ok: false, error: "too_long" };
  const { error } = await supabase.from(TABLE).insert({ user_id: userId, media_id: mediaId, body: trimmed });
  if (error) return { ok: false, error: "unknown" };
  return { ok: true };
}

export async function deleteComment(supabase: SupaLike, id: string): Promise<void> {
  const { error } = await supabase.from(TABLE).delete().eq("id", id);
  if (error) throw error;
}
