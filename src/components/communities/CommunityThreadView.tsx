"use client";

import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";
import { ThreadView } from "@/components/discussions/ThreadView";
import { createCommunityPost, moderateRemovePost, moderateDeleteThread, setThreadPinned } from "@/lib/communities/queries";
import type { DiscussionThread, DiscussionPost } from "@/lib/discussions/types";
import type { CommunityRole } from "@/lib/communities/types";

export function CommunityThreadView({ slug, thread, initialPosts, viewerRole }: {
  slug: string; thread: DiscussionThread; initialPosts: DiscussionPost[]; viewerRole: CommunityRole | null;
}) {
  const router = useRouter();
  const isMod = viewerRole === "owner" || viewerRole === "moderator";
  return (
    <div className="space-y-3">
      {isMod ? (
        <div className="flex gap-2">
          <button type="button" onClick={async () => { await setThreadPinned(supabaseBrowser(), thread.id, !thread.isPinned); router.refresh(); }}
            className="mono rounded-full border border-border-strong px-3 py-1.5 text-[11px]">
            {thread.isPinned ? "Unpin" : "Pin"}
          </button>
          <button type="button" onClick={async () => { if (window.confirm("Remove this thread?")) { await moderateDeleteThread(supabaseBrowser(), thread.id); router.push(`/communities/${slug}`); } }}
            className="mono rounded-full border border-border-strong px-3 py-1.5 text-[11px] text-pink">
            Remove thread
          </button>
        </div>
      ) : null}
      <ThreadView
        threadId={thread.id}
        initialPosts={initialPosts}
        canReply={viewerRole !== null}
        createReply={viewerRole ? (tid, pid, body) => createCommunityPost(supabaseBrowser(), tid, pid, body) : undefined}
        canModerate={isMod}
        onModerateRemove={async (postId) => { await moderateRemovePost(supabaseBrowser(), postId); router.refresh(); }}
      />
    </div>
  );
}
