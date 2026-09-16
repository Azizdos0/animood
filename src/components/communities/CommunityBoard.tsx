"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { isSupabaseConfigured, supabaseBrowser } from "@/lib/supabase/client";
import { createCommunityThread, listCommunityThreads } from "@/lib/communities/queries";
import type { Community, CommunityRole } from "@/lib/communities/types";
import type { DiscussionThread } from "@/lib/discussions/types";

type Status = "loading" | "ready" | "error" | "unconfigured";

const ERROR_COPY: Record<string, string> = {
  not_member: "Join this community to start a thread.",
  banned: "You can't post in this community.",
  bad_title: "Title is required (max 200 characters).",
  bad_body: "Body is required (max 5000 characters).",
  unknown: "Something went wrong.",
};

function errorCopy(error: string): string {
  return ERROR_COPY[error] ?? ERROR_COPY.unknown;
}

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const diffMs = Date.now() - then;
  const diffSec = Math.round(diffMs / 1000);
  const abs = Math.abs(diffSec);
  if (abs < 60) return "just now";
  const diffMin = Math.round(diffSec / 60);
  if (Math.abs(diffMin) < 60) return `${Math.abs(diffMin)}m ago`;
  const diffHr = Math.round(diffMin / 60);
  if (Math.abs(diffHr) < 24) return `${Math.abs(diffHr)}h ago`;
  const diffDay = Math.round(diffHr / 24);
  if (Math.abs(diffDay) < 30) return `${Math.abs(diffDay)}d ago`;
  const diffMonth = Math.round(diffDay / 30);
  if (Math.abs(diffMonth) < 12) return `${Math.abs(diffMonth)}mo ago`;
  const diffYear = Math.round(diffMonth / 12);
  return `${Math.abs(diffYear)}y ago`;
}

function ThreadRow({ slug, thread }: { slug: string; thread: DiscussionThread }) {
  return (
    <Link
      href={`/communities/${slug}/${thread.id}`}
      className="block rounded-2xl border border-border bg-surface/40 p-4 transition-colors hover:border-border-strong"
    >
      <div className="flex items-center justify-between gap-3">
        <p className="min-w-0 truncate text-sm font-semibold">
          {thread.isPinned ? <span aria-hidden="true">📌 </span> : null}
          {thread.title}
        </p>
        <span className="mono shrink-0 text-[11px] text-muted-2">{relativeTime(thread.lastActivityAt)}</span>
      </div>
      <div className="mt-1 flex items-center gap-2 text-[12px] text-muted-foreground">
        <span>@{thread.username}</span>
        <span className="text-muted-2">·</span>
        <span>{thread.replyCount} {thread.replyCount === 1 ? "reply" : "replies"}</span>
      </div>
    </Link>
  );
}

export function CommunityBoard({
  community,
  viewerRole,
  initialThreads,
}: {
  community: Community;
  viewerRole: CommunityRole | null;
  initialThreads: DiscussionThread[];
}) {
  const router = useRouter();
  const [status, setStatus] = useState<Status>("loading");
  const [threads, setThreads] = useState<DiscussionThread[]>(initialThreads);
  const [signedIn, setSignedIn] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [pending, setPending] = useState(false);
  const [composerError, setComposerError] = useState<string | null>(null);
  const cancelledRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    cancelledRef.current = false;

    if (!isSupabaseConfigured()) {
      setStatus("unconfigured");
      return;
    }

    async function load() {
      try {
        const supabase = supabaseBrowser();
        const [{ data }, list] = await Promise.all([
          supabase.auth.getUser(),
          listCommunityThreads(supabase, community.id),
        ]);
        if (cancelled) return;
        setSignedIn(!!data.user);
        setThreads(list);
        setStatus("ready");
      } catch {
        if (cancelled) return;
        setStatus("error");
      }
    }

    void load();
    return () => {
      cancelled = true;
      cancelledRef.current = true;
    };
  }, [community.id]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (viewerRole === null || pending || title.trim() === "" || body.trim() === "") return;
    setPending(true);
    setComposerError(null);
    try {
      const result = await createCommunityThread(supabaseBrowser(), community.id, title, body);
      if (result.ok) {
        router.push(`/communities/${community.slug}/${result.id}`);
      } else {
        setComposerError(errorCopy(result.error));
      }
    } finally {
      if (!cancelledRef.current) setPending(false);
    }
  }

  if (status === "unconfigured") {
    return (
      <div>
        <div className="mono mb-4 text-[11px] tracking-[0.16em] text-violet">THREADS</div>
        <p className="text-sm text-muted-foreground">Community threads unavailable.</p>
      </div>
    );
  }

  return (
    <div>
      <div className="mono mb-4 text-[11px] tracking-[0.16em] text-violet">
        Threads ({threads.length})
      </div>

      {viewerRole !== null ? (
        <form onSubmit={handleSubmit} className="mb-6 space-y-2">
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Thread title…"
            maxLength={200}
            aria-label="Thread title"
            className="w-full rounded-2xl border border-border bg-surface/40 p-3 text-sm outline-none focus:border-border-strong"
          />
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="What do you want to discuss?"
            rows={3}
            maxLength={5000}
            aria-label="Thread body"
            className="w-full rounded-2xl border border-border bg-surface/40 p-3 text-sm outline-none focus:border-border-strong"
          />
          <div className="flex items-center justify-between gap-2">
            {composerError ? (
              <span className="text-[12px] text-pink">{composerError}</span>
            ) : (
              <span />
            )}
            <button
              type="submit"
              disabled={pending || title.trim() === "" || body.trim() === ""}
              className="rounded-full bg-foreground px-4 py-2 text-[12px] font-extrabold text-background transition-colors hover:bg-pink disabled:opacity-40"
            >
              Post
            </button>
          </div>
        </form>
      ) : status === "ready" ? (
        <p className="mb-6 text-sm text-muted-foreground">
          {signedIn ? "Join to start a thread." : "Sign in to join the conversation."}
        </p>
      ) : null}

      {status === "loading" ? (
        <div className="space-y-3">
          <div className="skeleton h-16 w-full rounded-2xl" />
          <div className="skeleton h-16 w-full rounded-2xl" />
        </div>
      ) : status === "error" ? (
        <p className="rounded-2xl border border-dashed border-border py-12 text-center text-sm text-muted-foreground">
          Couldn&apos;t load threads right now. Please try again later.
        </p>
      ) : threads.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border py-12 text-center text-sm text-muted-foreground">
          No threads yet — start one.
        </p>
      ) : (
        <div className="space-y-3">
          {threads.map((thread) => (
            <ThreadRow key={thread.id} slug={community.slug} thread={thread} />
          ))}
        </div>
      )}
    </div>
  );
}
