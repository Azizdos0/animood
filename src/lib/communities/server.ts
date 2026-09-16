import { supabaseServer } from "@/lib/supabase/server";
import { getThread, getThreadPosts } from "@/lib/discussions/queries";
import { getCommunityBySlug, getMyRole, listCommunityThreads } from "./queries";
import type { Community, CommunityRole } from "./types";
import type { DiscussionThread, DiscussionPost } from "@/lib/discussions/types";

export type CommunityPageState =
  | { state: "not_found" }
  | { state: "ok"; community: Community; viewerRole: CommunityRole | null; threads: DiscussionThread[] };

export async function loadCommunityPage(slug: string, viewerId: string | null): Promise<CommunityPageState> {
  const supabase = await supabaseServer();
  const community = await getCommunityBySlug(supabase as never, slug);
  if (!community) return { state: "not_found" };
  const [viewerRole, threads] = await Promise.all([
    viewerId ? getMyRole(supabase as never, community.id, viewerId) : Promise.resolve(null),
    listCommunityThreads(supabase as never, community.id),
  ]);
  return { state: "ok", community, viewerRole, threads };
}

export type CommunityThreadState =
  | { state: "not_found" }
  | { state: "ok"; community: Community; thread: DiscussionThread; posts: DiscussionPost[]; viewerRole: CommunityRole | null };

export async function loadCommunityThread(slug: string, threadId: string, viewerId: string | null): Promise<CommunityThreadState> {
  const supabase = await supabaseServer();
  const community = await getCommunityBySlug(supabase as never, slug);
  if (!community) return { state: "not_found" };
  const thread = await getThread(supabase as never, threadId);
  if (!thread || thread.communityId !== community.id) return { state: "not_found" };
  const [posts, viewerRole] = await Promise.all([
    getThreadPosts(supabase as never, threadId),
    viewerId ? getMyRole(supabase as never, community.id, viewerId) : Promise.resolve(null),
  ]);
  return { state: "ok", community, thread, posts, viewerRole };
}
