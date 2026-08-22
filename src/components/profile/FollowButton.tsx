"use client";

import { useEffect, useRef, useState } from "react";
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
  const [viewerId, setViewerId] = useState<string | null>(null);
  const [viewerResolved, setViewerResolved] = useState(false);

  useEffect(() => {
    let cancelled = false;
    supabaseBrowser()
      .auth.getUser()
      .then(({ data }) => {
        if (cancelled) return;
        setViewerId(data.user?.id ?? null);
        setViewerResolved(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleClick() {
    if (pendingRef.current) return;
    if (!viewerId) return;
    pendingRef.current = true;
    setPending(true);
    try {
      const supabase = supabaseBrowser();
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

  if (!viewerResolved || !viewerId) return null;

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
