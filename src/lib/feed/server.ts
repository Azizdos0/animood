import { supabaseServer } from "@/lib/supabase/server";
import type { FeedItem, FeedState } from "./types";

export async function loadFeed(limit = 50): Promise<FeedState> {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const viewer = userData.user;
  if (!viewer) return { state: "signed_out" };

  const { data: followRows, error: followErr } = await supabase
    .from("follows").select("following_id").eq("follower_id", viewer.id);
  if (followErr) throw followErr;
  const ids = (followRows ?? []).map((r: { following_id: string }) => r.following_id);
  if (ids.length === 0) return { state: "ok", items: [] };

  const { data: entryRows, error: entryErr } = await supabase
    .from("list_entries")
    .select("user_id, media_id, status, score, updated_at")
    .in("user_id", ids)
    .order("updated_at", { ascending: false })
    .limit(limit);
  if (entryErr) throw entryErr;
  const rows = entryRows ?? [];
  if (rows.length === 0) return { state: "ok", items: [] };

  const distinctIds = [...new Set(rows.map((r: { user_id: string }) => r.user_id))];
  const { data: profRows, error: profErr } = await supabase
    .from("profiles").select("user_id, username, display_name, avatar_url").in("user_id", distinctIds);
  if (profErr) throw profErr;
  const byId = new Map<string, { username: string; display_name: string | null; avatar_url: string | null }>();
  for (const p of profRows ?? []) byId.set(p.user_id, p);

  const items: FeedItem[] = [];
  for (const r of rows) {
    const p = byId.get(r.user_id);
    if (!p) continue;
    items.push({
      username: p.username, displayName: p.display_name, avatarUrl: p.avatar_url,
      mediaId: r.media_id, status: r.status, score: r.score, updatedAt: r.updated_at,
    });
  }
  return { state: "ok", items };
}
