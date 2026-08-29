import type { SupaLike } from "@/lib/sync/cloud";
import type { UserResult } from "./types";

interface ProfileRow { username: string; display_name: string | null; avatar_url: string | null }
const COLS = "username, display_name, avatar_url";

export function sanitizeTerm(q: string): string {
  return q.trim().replace(/[^\p{L}\p{N} _-]/gu, "");
}

function toResult(r: ProfileRow): UserResult {
  return { username: r.username, displayName: r.display_name, avatarUrl: r.avatar_url };
}

export async function searchUsers(supabase: SupaLike, query: string, limit = 20): Promise<UserResult[]> {
  const t = sanitizeTerm(query);
  if (t.length < 2) return [];
  const { data, error } = await supabase.from("profiles")
    .select(COLS)
    .or(`username.ilike.%${t}%,display_name.ilike.%${t}%`)
    .order("username")
    .limit(limit);
  if (error) throw error;
  return ((data ?? []) as ProfileRow[]).map(toResult);
}

async function profilesForIds(supabase: SupaLike, ids: string[], limit: number): Promise<UserResult[]> {
  if (ids.length === 0) return [];
  const { data, error } = await supabase.from("profiles").select(COLS).in("user_id", ids).limit(limit);
  if (error) throw error;
  return ((data ?? []) as ProfileRow[]).map(toResult);
}

export async function getFollowers(supabase: SupaLike, userId: string, limit = 100): Promise<UserResult[]> {
  const { data, error } = await supabase.from("follows").select("follower_id").eq("following_id", userId);
  if (error) throw error;
  const ids = ((data ?? []) as { follower_id: string }[]).map((r) => r.follower_id);
  return profilesForIds(supabase, ids, limit);
}

export async function getFollowing(supabase: SupaLike, userId: string, limit = 100): Promise<UserResult[]> {
  const { data, error } = await supabase.from("follows").select("following_id").eq("follower_id", userId);
  if (error) throw error;
  const ids = ((data ?? []) as { following_id: string }[]).map((r) => r.following_id);
  return profilesForIds(supabase, ids, limit);
}
