"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { isSupabaseConfigured, supabaseBrowser } from "@/lib/supabase/client";
import { addComment, deleteComment, listComments } from "@/lib/comments/queries";
import type { CommentItem } from "@/lib/comments/types";

type Status = "loading" | "ready" | "error" | "unconfigured";

const ERROR_COPY: Record<"empty" | "too_long" | "unknown", string> = {
  empty: "Comment can't be empty.",
  too_long: "Keep it under 2000 characters.",
  unknown: "Something went wrong.",
};

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

function Avatar({ avatarUrl, name }: { avatarUrl: string | null; name: string }) {
  const initial = (name || "?").slice(0, 1).toUpperCase();
  return (
    <div className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-full bg-gradient-to-br from-pink to-violet text-sm font-black text-on-accent">
      {avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={avatarUrl} alt={name} className="h-10 w-10 rounded-full object-cover" />
      ) : (
        initial
      )}
    </div>
  );
}

function CommentRow({
  item,
  viewerId,
  onDelete,
}: {
  item: CommentItem;
  viewerId: string | null;
  onDelete: (id: string) => void;
}) {
  const name = item.displayName ?? item.username;
  const [pending, setPending] = useState(false);

  async function handleDelete() {
    if (pending) return;
    if (!window.confirm("Delete this comment?")) return;
    setPending(true);
    try {
      await deleteComment(supabaseBrowser(), item.id);
      onDelete(item.id);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex gap-3 rounded-2xl border border-border bg-surface/40 p-4">
      <Avatar avatarUrl={item.avatarUrl} name={name} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-sm">
            <Link href={`/u/${item.username}`} className="font-semibold hover:underline">
              @{item.username}
            </Link>
            <span className="mono text-[11px] text-muted-2">{relativeTime(item.createdAt)}</span>
          </div>
          {item.userId === viewerId ? (
            <button
              type="button"
              onClick={handleDelete}
              disabled={pending}
              aria-label="Delete"
              className="mono text-[11px] tracking-[0.08em] text-muted-2 hover:text-pink"
            >
              Delete
            </button>
          ) : null}
        </div>
        <p className="mt-1 whitespace-pre-wrap break-words text-sm text-muted-foreground">
          {item.body}
        </p>
      </div>
    </div>
  );
}

export function CommentSection({ mediaId }: { mediaId: number }) {
  const [status, setStatus] = useState<Status>("loading");
  const [items, setItems] = useState<CommentItem[]>([]);
  const [viewerId, setViewerId] = useState<string | null>(null);
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
          listComments(supabase, mediaId),
        ]);
        if (cancelled) return;
        setViewerId(data.user?.id ?? null);
        setItems(list);
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
  }, [mediaId]);

  async function refetch() {
    try {
      const list = await listComments(supabaseBrowser(), mediaId);
      if (cancelledRef.current) return;
      setItems(list);
    } catch {
      // keep existing items on refetch failure
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!viewerId || pending || body.trim() === "") return;
    setPending(true);
    setComposerError(null);
    try {
      const result = await addComment(supabaseBrowser(), viewerId, mediaId, body);
      if (result.ok) {
        setBody("");
        await refetch();
      } else {
        setComposerError(ERROR_COPY[result.error]);
      }
    } finally {
      setPending(false);
    }
  }

  function handleDeleted(id: string) {
    setItems((prev) => prev.filter((c) => c.id !== id));
  }

  if (status === "unconfigured") {
    return (
      <div>
        <div className="mono mb-4 text-[11px] tracking-[0.16em] text-violet">COMMENTS</div>
        <p className="text-sm text-muted-foreground">Comments are unavailable.</p>
      </div>
    );
  }

  return (
    <div>
      <div className="mono mb-4 text-[11px] tracking-[0.16em] text-violet">
        Comments ({items.length})
      </div>

      {viewerId ? (
        <form onSubmit={handleSubmit} className="mb-6 space-y-2">
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Share your thoughts..."
            rows={3}
            maxLength={2000}
            aria-label="Add a comment"
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
              disabled={pending || body.trim() === ""}
              className="rounded-full bg-foreground px-4 py-2 text-[12px] font-extrabold text-background transition-colors hover:bg-pink disabled:opacity-40"
            >
              Post
            </button>
          </div>
        </form>
      ) : status === "ready" ? (
        <p className="mb-6 text-sm text-muted-foreground">Sign in to comment.</p>
      ) : null}

      {status === "loading" ? (
        <div className="space-y-3">
          <div className="skeleton h-16 w-full rounded-2xl" />
          <div className="skeleton h-16 w-full rounded-2xl" />
        </div>
      ) : status === "error" ? (
        <p className="rounded-2xl border border-dashed border-border py-12 text-center text-sm text-muted-foreground">
          Couldn&apos;t load comments right now. Please try again later.
        </p>
      ) : items.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border py-12 text-center text-sm text-muted-foreground">
          No comments yet. Be the first.
        </p>
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <CommentRow key={item.id} item={item} viewerId={viewerId} onDelete={handleDeleted} />
          ))}
        </div>
      )}
    </div>
  );
}
