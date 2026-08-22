"use client";

import { useRef, useState } from "react";
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
  const pendingRef = useRef(false);

  async function handleClick() {
    if (pendingRef.current) return;
    pendingRef.current = true;
    setPending(true);
    try {
      const supabase = supabaseBrowser();
      const { data } = await supabase.auth.getUser();
      const viewerId = data.user?.id ?? null;
      if (!viewerId) return;

      const next = !following;
      setFollowing(next);
      try {
        if (next) {
          await followUser(supabase, viewerId, targetUserId);
        } else {
          await unfollowUser(supabase, viewerId, targetUserId);
        }
      } catch {
        setFollowing(!next);
      }
    } finally {
      pendingRef.current = false;
      setPending(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={pending}
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
