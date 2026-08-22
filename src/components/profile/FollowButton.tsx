"use client";

import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { followUser, unfollowUser } from "@/lib/follow/queries";

export function FollowButton({
  targetUserId,
  initialFollowing,
}: {
  targetUserId: string;
  initialFollowing: boolean;
}) {
  const [following, setFollowing] = useState(initialFollowing);
  const [pending, setPending] = useState(false);

  async function handleClick() {
    if (pending) return;
    const supabase = supabaseBrowser();
    const { data } = await supabase.auth.getUser();
    const viewerId = data.user?.id ?? null;
    if (!viewerId) return;

    const next = !following;
    setFollowing(next);
    setPending(true);
    try {
      if (next) {
        await followUser(supabase, viewerId, targetUserId);
      } else {
        await unfollowUser(supabase, viewerId, targetUserId);
      }
    } catch {
      setFollowing(!next);
    } finally {
      setPending(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-pressed={following}
      className={
        following
          ? "rounded-full border border-border-strong px-4 py-2 text-[12px] font-extrabold transition-colors"
          : "rounded-full bg-foreground px-4 py-2 text-[12px] font-extrabold text-background transition-colors hover:bg-pink"
      }
    >
      {following ? "Following" : "Follow"}
    </button>
  );
}
