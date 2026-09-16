"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { isSupabaseConfigured, supabaseBrowser } from "@/lib/supabase/client";
import { joinCommunity, leaveCommunity } from "@/lib/communities/queries";
import type { Community, CommunityRole } from "@/lib/communities/types";

export function CommunityHeader({
  community,
  viewerRole,
}: {
  community: Community;
  viewerRole: CommunityRole | null;
}) {
  const router = useRouter();
  const [signedIn, setSignedIn] = useState(false);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!isSupabaseConfigured()) return;
    let cancelled = false;
    supabaseBrowser()
      .auth.getUser()
      .then(({ data }) => {
        if (cancelled) return;
        setSignedIn(!!data.user);
      })
      .catch(() => {
        if (cancelled) return;
        setSignedIn(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleJoin() {
    if (!signedIn || pending) return;
    setPending(true);
    try {
      await joinCommunity(supabaseBrowser(), community.id);
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  async function handleLeave() {
    if (pending) return;
    setPending(true);
    try {
      await leaveCommunity(supabaseBrowser(), community.id);
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  const canManage = viewerRole === "owner" || viewerRole === "moderator";

  return (
    <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border pb-8">
      <div>
        <h1 className="text-[clamp(28px,4vw,44px)] font-black leading-[0.95] tracking-[-0.03em]">
          {community.name}
        </h1>
        {community.description ? (
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{community.description}</p>
        ) : null}
        <p className="mono mt-3 text-[11px] tracking-[0.1em] text-muted-2">
          {community.memberCount} {community.memberCount === 1 ? "member" : "members"}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {canManage ? (
          <Link
            href={`/communities/${community.slug}/manage`}
            className="rounded-full border border-border-strong px-4 py-2 text-[12px] font-extrabold transition-colors hover:border-foreground"
          >
            Manage
          </Link>
        ) : null}
        {viewerRole === null ? (
          <button
            type="button"
            onClick={handleJoin}
            disabled={!signedIn || pending}
            className="rounded-full bg-foreground px-4 py-2 text-[12px] font-extrabold text-background transition-colors hover:bg-pink disabled:opacity-40"
          >
            Join
          </button>
        ) : viewerRole !== "owner" ? (
          <button
            type="button"
            onClick={handleLeave}
            disabled={pending}
            className="rounded-full border border-border-strong px-4 py-2 text-[12px] font-extrabold transition-colors hover:border-foreground disabled:opacity-40"
          >
            Leave
          </button>
        ) : null}
      </div>
    </div>
  );
}
