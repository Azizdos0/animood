import type { SupaLike } from "@/lib/sync/cloud";

const TABLE = "follows";

export async function followUser(supabase: SupaLike, followerId: string, followingId: string): Promise<void> {
  const { error } = await supabase.from(TABLE).insert({ follower_id: followerId, following_id: followingId });
  if (error && (error as { code?: string }).code !== "23505") throw error;
}

export async function unfollowUser(supabase: SupaLike, followerId: string, followingId: string): Promise<void> {
  const { error } = await supabase.from(TABLE).delete().eq("follower_id", followerId).eq("following_id", followingId);
  if (error) throw error;
}

export async function isFollowing(supabase: SupaLike, followerId: string, followingId: string): Promise<boolean> {
  const { data, error } = await supabase.from(TABLE).select("follower_id")
    .eq("follower_id", followerId).eq("following_id", followingId).maybeSingle();
  if (error) throw error;
  return data != null;
}

export async function getFollowCounts(
  supabase: SupaLike, userId: string
): Promise<{ followers: number; following: number }> {
  const { data, error } = await supabase.rpc("get_follow_counts", { p_user_id: userId });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  return { followers: row?.followers ?? 0, following: row?.following ?? 0 };
}
