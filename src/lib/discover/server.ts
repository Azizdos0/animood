import { supabaseServer } from "@/lib/supabase/server";
import { getProfileCard } from "@/lib/profile/queries";
import { getFollowers, getFollowing } from "@/lib/discover/queries";
import type { Profile } from "@/lib/profile/types";
import type { UserResult } from "./types";

export type FollowDirection = "followers" | "following";
export type FollowListState =
  | { state: "not_found" }
  | { state: "private"; profile: Profile }
  | { state: "ok"; profile: Profile; users: UserResult[] };

export async function loadFollowList(username: string, direction: FollowDirection): Promise<FollowListState> {
  const supabase = await supabaseServer();
  const profile = await getProfileCard(supabase as never, username);
  if (!profile) return { state: "not_found" };
  const { data } = await supabase.auth.getUser();
  const isOwner = data.user?.id === profile.userId;
  if (!profile.isPublic && !isOwner) {
    return { state: "private", profile };
  }
  const users = direction === "followers"
    ? await getFollowers(supabase as never, profile.userId)
    : await getFollowing(supabase as never, profile.userId);
  return { state: "ok", profile, users };
}
