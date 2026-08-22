import type { ListEntry } from "@/lib/list/schema";
import type { CloudRow } from "@/lib/sync/types";
import { rowToEntry } from "@/lib/sync/merge";
import { supabaseServer } from "@/lib/supabase/server";
import { getProfileCard } from "@/lib/profile/queries";
import { getFollowCounts, isFollowing } from "@/lib/follow/queries";
import type { Profile } from "@/lib/profile/types";

export function entriesFromRows(rows: CloudRow[]): Record<number, ListEntry> {
  const out: Record<number, ListEntry> = {};
  for (const row of rows) {
    const { mediaId, entry } = rowToEntry(row);
    out[mediaId] = entry;
  }
  return out;
}

type FollowCounts = { followers: number; following: number };

export type ProfilePageState =
  | { state: "not_found" }
  | { state: "private"; profile: Profile; isOwner: boolean; followCounts: FollowCounts; viewerFollows: boolean }
  | { state: "ok"; profile: Profile; isOwner: boolean; entries: Record<number, ListEntry>; followCounts: FollowCounts; viewerFollows: boolean };

async function loadFollowState(
  supabase: Awaited<ReturnType<typeof supabaseServer>>,
  viewerId: string | null,
  isOwner: boolean,
  profileUserId: string
): Promise<{ followCounts: FollowCounts; viewerFollows: boolean }> {
  let followCounts: FollowCounts = { followers: 0, following: 0 };
  try {
    followCounts = await getFollowCounts(supabase as never, profileUserId);
  } catch {
    followCounts = { followers: 0, following: 0 };
  }

  let viewerFollows = false;
  if (!isOwner && viewerId) {
    try {
      viewerFollows = await isFollowing(supabase as never, viewerId, profileUserId);
    } catch {
      viewerFollows = false;
    }
  }

  return { followCounts, viewerFollows };
}

export async function loadProfilePage(username: string): Promise<ProfilePageState> {
  const supabase = await supabaseServer();
  const profile = await getProfileCard(supabase as never, username);
  if (!profile) return { state: "not_found" };
  const { data } = await supabase.auth.getUser();
  const viewerId = data.user?.id ?? null;
  const isOwner = viewerId === profile.userId;
  if (!profile.isPublic && !isOwner) {
    const { followCounts, viewerFollows } = await loadFollowState(supabase, viewerId, isOwner, profile.userId);
    return { state: "private", profile, isOwner, followCounts, viewerFollows };
  }
  const { pullCloud } = await import("@/lib/sync/cloud");
  const rows = await pullCloud(supabase as never, profile.userId);
  const { followCounts, viewerFollows } = await loadFollowState(supabase, viewerId, isOwner, profile.userId);
  return { state: "ok", profile, isOwner, entries: entriesFromRows(rows), followCounts, viewerFollows };
}
