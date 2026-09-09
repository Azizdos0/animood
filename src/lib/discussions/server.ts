import { supabaseServer } from "@/lib/supabase/server";
import { getThread, getThreadPosts } from "@/lib/discussions/queries";
import type { DiscussionThread, DiscussionPost } from "./types";

export type ThreadPageState =
  | { state: "not_found" }
  | { state: "ok"; thread: DiscussionThread; posts: DiscussionPost[] };

export async function loadThread(mediaId: number, threadId: string): Promise<ThreadPageState> {
  const supabase = await supabaseServer();
  const thread = await getThread(supabase as never, threadId);
  if (!thread || thread.mediaId !== mediaId) return { state: "not_found" };
  const posts = await getThreadPosts(supabase as never, threadId);
  return { state: "ok", thread, posts };
}
