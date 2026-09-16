"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { listCommunities } from "@/lib/communities/queries";
import { isSupabaseConfigured, supabaseBrowser } from "@/lib/supabase/client";
import type { Community } from "@/lib/communities/types";

type Status = "loading" | "ready" | "error" | "unconfigured";

const DEBOUNCE_MS = 300;

function DirectorySkeleton() {
  return (
    <div className="space-y-3" aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <div key={i} className="skeleton h-20 w-full rounded-2xl" />
      ))}
    </div>
  );
}

function CommunityCard({ community }: { community: Community }) {
  return (
    <Link
      href={`/communities/${community.slug}`}
      className="block rounded-2xl border border-border bg-surface/40 p-4 transition-colors hover:border-border-strong"
    >
      <div className="flex items-center justify-between gap-3">
        <p className="min-w-0 truncate text-sm font-semibold">{community.name}</p>
        <span className="mono shrink-0 text-[11px] text-muted-2">
          {community.memberCount} {community.memberCount === 1 ? "member" : "members"}
        </span>
      </div>
      {community.description ? (
        <p className="mt-1 line-clamp-2 text-[13px] text-muted-foreground">{community.description}</p>
      ) : null}
    </Link>
  );
}

export function CommunityDirectory() {
  const [status, setStatus] = useState<Status>("loading");
  const [communities, setCommunities] = useState<Community[]>([]);
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!isSupabaseConfigured()) {
      setStatus("unconfigured");
      return;
    }

    let cancelled = false;
    setStatus((prev) => (prev === "loading" ? prev : "loading"));

    const timer = setTimeout(() => {
      listCommunities(supabaseBrowser(), query)
        .then((list) => {
          if (cancelled) return;
          setCommunities(list);
          setStatus("ready");
        })
        .catch(() => {
          if (cancelled) return;
          setStatus("error");
        });
    }, query ? DEBOUNCE_MS : 0);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);

  if (status === "unconfigured") {
    return <p className="text-sm text-muted-foreground">Communities are unavailable.</p>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search communities"
          placeholder="Search communities…"
          className="min-w-48 flex-1 rounded-2xl border border-border bg-surface/40 px-4 py-3 text-sm outline-none transition-colors focus:border-border-strong"
        />
        <Link
          href="/communities/new"
          className="shrink-0 rounded-full bg-foreground px-4 py-2.5 text-[12px] font-extrabold text-background transition-colors hover:bg-pink"
        >
          Create community
        </Link>
      </div>

      {status === "loading" ? (
        <DirectorySkeleton />
      ) : status === "error" ? (
        <p className="rounded-2xl border border-dashed border-border py-12 text-center text-sm text-muted-foreground">
          Couldn&apos;t load communities right now. Please try again later.
        </p>
      ) : communities.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border py-12 text-center text-sm text-muted-foreground">
          No communities yet — start one.
        </p>
      ) : (
        <div className="space-y-3">
          {communities.map((community) => (
            <CommunityCard key={community.id} community={community} />
          ))}
        </div>
      )}
    </div>
  );
}
