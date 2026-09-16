import type { SupaLike } from "@/lib/sync/cloud";
import type { DiscussionThread } from "@/lib/discussions/types";
import type { Community, CommunityMember, CommunityRole } from "./types";

interface CommunityRow { id: string; slug: string; name: string; description: string; member_count: number; created_by: string; created_at: string }
const COMMUNITY_COLS = "id, slug, name, description, member_count, created_by, created_at";

function mapCommunity(r: CommunityRow): Community {
  return { id: r.id, slug: r.slug, name: r.name, description: r.description, memberCount: Number(r.member_count), createdBy: r.created_by, createdAt: r.created_at };
}
function sanitize(q: string): string { return q.trim().replace(/[^\p{L}\p{N} _-]/gu, ""); }

export async function listCommunities(supabase: SupaLike, search = "", limit = 50): Promise<Community[]> {
  let query = supabase.from("communities").select(COMMUNITY_COLS);
  const t = sanitize(search);
  if (t.length >= 2) query = query.or(`slug.ilike.%${t}%,name.ilike.%${t}%`);
  const { data, error } = await query.order("member_count", { ascending: false }).limit(limit);
  if (error) throw error;
  return ((data ?? []) as CommunityRow[]).map(mapCommunity);
}

export async function getCommunityBySlug(supabase: SupaLike, slug: string): Promise<Community | null> {
  const { data, error } = await supabase.from("communities").select(COMMUNITY_COLS).eq("slug", slug).limit(1);
  if (error) throw error;
  const rows = (data ?? []) as CommunityRow[];
  return rows.length ? mapCommunity(rows[0]) : null;
}

export async function getMembers(supabase: SupaLike, communityId: string): Promise<CommunityMember[]> {
  const { data, error } = await supabase.rpc("get_community_members", { p_community_id: communityId });
  if (error) throw error;
  return ((data ?? []) as { user_id: string; role: CommunityRole; username: string; display_name: string | null; avatar_url: string | null }[])
    .filter((r) => r.username)
    .map((r) => ({ userId: r.user_id, role: r.role, username: r.username, displayName: r.display_name, avatarUrl: r.avatar_url }));
}

export async function getMyRole(supabase: SupaLike, communityId: string, userId: string): Promise<CommunityRole | null> {
  const { data, error } = await supabase.from("community_members").select("role").eq("community_id", communityId).eq("user_id", userId).limit(1);
  if (error) throw error;
  const rows = (data ?? []) as { role: CommunityRole }[];
  return rows.length ? rows[0].role : null;
}

export async function listCommunityThreads(supabase: SupaLike, communityId: string, limit = 100): Promise<DiscussionThread[]> {
  const { data, error } = await supabase.rpc("get_community_threads", { p_community_id: communityId, p_limit: limit });
  if (error) throw error;
  return ((data ?? []) as Record<string, unknown>[])
    .filter((r) => r.username)
    .map((r) => ({
      id: r.id as string, mediaId: 0, userId: r.user_id as string, title: r.title as string,
      createdAt: r.created_at as string, lastActivityAt: r.last_activity_at as string,
      replyCount: Number(r.reply_count), username: r.username as string,
      displayName: (r.display_name as string) ?? null, avatarUrl: (r.avatar_url as string) ?? null,
      communityId: r.community_id as string, isPinned: Boolean(r.is_pinned),
    }));
}

type Mut = { ok: true } | { ok: false; error: string };
async function callVoid(supabase: SupaLike, fn: string, args: Record<string, unknown>): Promise<Mut> {
  const { error } = await supabase.rpc(fn, args);
  if (!error) return { ok: true };
  return { ok: false, error: error.message ?? "unknown" };
}

export async function createCommunity(supabase: SupaLike, slug: string, name: string, description: string): Promise<{ ok: true; id: string } | { ok: false; error: "slug_taken" | "invalid" | "unknown" }> {
  const { data, error } = await supabase.rpc("create_community", { p_slug: slug, p_name: name, p_description: description });
  if (!error) return { ok: true, id: data as string };
  const msg = (error.message ?? "").toLowerCase();
  if (msg.includes("duplicate") || msg.includes("unique") || msg.includes("slug")) return { ok: false, error: "slug_taken" };
  if (msg.includes("check") || msg.includes("violates")) return { ok: false, error: "invalid" };
  return { ok: false, error: "unknown" };
}

export const joinCommunity = (s: SupaLike, id: string) => callVoid(s, "join_community", { p_community_id: id });
export const leaveCommunity = (s: SupaLike, id: string) => callVoid(s, "leave_community", { p_community_id: id });
export const deleteCommunity = (s: SupaLike, id: string) => callVoid(s, "delete_community", { p_community_id: id });
export const setMemberRole = (s: SupaLike, id: string, target: string, role: CommunityRole) => callVoid(s, "set_member_role", { p_community_id: id, p_target: target, p_role: role });
export const banMember = (s: SupaLike, id: string, target: string) => callVoid(s, "ban_member", { p_community_id: id, p_target: target });
export const unbanMember = (s: SupaLike, id: string, target: string) => callVoid(s, "unban_member", { p_community_id: id, p_target: target });
export const setThreadPinned = (s: SupaLike, threadId: string, pinned: boolean) => callVoid(s, "set_thread_pinned", { p_thread_id: threadId, p_pinned: pinned });
export const moderateRemovePost = (s: SupaLike, postId: string) => callVoid(s, "moderate_remove_post", { p_post_id: postId });
export const moderateDeleteThread = (s: SupaLike, threadId: string) => callVoid(s, "moderate_delete_thread", { p_thread_id: threadId });

export async function createCommunityThread(supabase: SupaLike, communityId: string, title: string, body: string): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const { data, error } = await supabase.rpc("create_community_thread", { p_community_id: communityId, p_title: title, p_body: body });
  if (error) return { ok: false, error: error.message ?? "unknown" };
  return { ok: true, id: data as string };
}
export const createCommunityPost = (s: SupaLike, threadId: string, parentPostId: string | null, body: string) =>
  callVoid(s, "create_community_post", { p_thread_id: threadId, p_parent_post_id: parentPostId, p_body: body });
