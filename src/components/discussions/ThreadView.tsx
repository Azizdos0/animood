"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { supabaseBrowser } from "@/lib/supabase/client";
import { createPost, deletePost, getThreadPosts } from "@/lib/discussions/queries";
import { buildPostTree } from "@/lib/discussions/tree";
import type { DiscussionPost, PostNode } from "@/lib/discussions/types";

const MAX_DEPTH = 5;

const ERROR_COPY: Record<"empty" | "too_long" | "unknown", string> = {
  empty: "Reply can't be empty.",
  too_long: "Reply is too long (max 5000 characters).",
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
    <div className="grid h-8 w-8 shrink-0 place-items-center overflow-hidden rounded-full bg-gradient-to-br from-pink to-violet text-xs font-black text-on-accent">
      {avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={avatarUrl} alt={name} className="h-8 w-8 rounded-full object-cover" />
      ) : (
        initial
      )}
    </div>
  );
}

function Composer({
  onSubmit,
  onCancel,
  pending,
  error,
  autoFocus,
}: {
  onSubmit: (body: string) => void;
  onCancel?: () => void;
  pending: boolean;
  error: string | null;
  autoFocus?: boolean;
}) {
  const [body, setBody] = useState("");

  function handlePost() {
    if (pending || body.trim() === "") return;
    onSubmit(body);
    setBody("");
  }

  return (
    <div className="space-y-2">
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Write a reply…"
        rows={2}
        maxLength={5000}
        autoFocus={autoFocus}
        aria-label="Reply body"
        className="w-full rounded-2xl border border-border bg-surface/40 p-3 text-sm outline-none focus:border-border-strong"
      />
      <div className="flex items-center justify-between gap-2">
        {error ? <span className="text-[12px] text-pink">{error}</span> : <span />}
        <div className="flex items-center gap-2">
          {onCancel ? (
            <button
              type="button"
              onClick={onCancel}
              className="rounded-full px-3 py-1.5 text-[12px] font-semibold text-muted-foreground hover:text-foreground"
            >
              Cancel
            </button>
          ) : null}
          <button
            type="button"
            onClick={handlePost}
            disabled={pending || body.trim() === ""}
            className="rounded-full bg-foreground px-4 py-1.5 text-[12px] font-extrabold text-background transition-colors hover:bg-pink disabled:opacity-40"
          >
            Post
          </button>
        </div>
      </div>
    </div>
  );
}

function PostItem({
  node,
  depth,
  viewerId,
  onReply,
  onDelete,
  doReply,
  canReply,
  canModerate,
  onModerateRemove,
}: {
  node: PostNode;
  depth: number;
  viewerId: string | null;
  onReply: (parentPostId: string, body: string) => Promise<void>;
  onDelete: (postId: string) => Promise<void>;
  doReply: (parentPostId: string, body: string) => Promise<{ ok: true } | { ok: false; error: "empty" | "too_long" | "unknown" | string }>;
  canReply: boolean;
  canModerate: boolean;
  onModerateRemove?: (postId: string) => Promise<void>;
}) {
  const [replyOpen, setReplyOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [moderating, setModerating] = useState(false);
  const name = node.displayName ?? node.username;
  const cappedDepth = Math.min(depth, MAX_DEPTH);

  async function handleReplySubmit(body: string) {
    setPending(true);
    setError(null);
    try {
      const result = await doReply(node.id, body);
      if (result.ok) {
        setReplyOpen(false);
        await onReply(node.id, body);
      } else {
        setError(ERROR_COPY[result.error as "empty" | "too_long" | "unknown"] ?? ERROR_COPY.unknown);
      }
    } finally {
      setPending(false);
    }
  }

  async function handleDeleteClick() {
    if (!window.confirm("Delete this post?")) return;
    await onDelete(node.id);
  }

  async function handleModerateRemoveClick() {
    if (!onModerateRemove) return;
    if (!window.confirm("Remove this post?")) return;
    setModerating(true);
    try {
      await onModerateRemove(node.id);
    } finally {
      setModerating(false);
    }
  }

  return (
    <div
      style={{ marginLeft: cappedDepth > 0 ? `${cappedDepth * 16}px` : undefined }}
      className={cappedDepth > 0 ? "border-l border-border pl-3" : ""}
    >
      <div className="flex gap-3 py-3">
        <Avatar avatarUrl={node.avatarUrl} name={name} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-[12px]">
            <Link href={`/u/${node.username}`} className="font-semibold hover:underline">
              @{node.username}
            </Link>
            <span className="mono text-muted-2">{relativeTime(node.createdAt)}</span>
          </div>
          {node.isDeleted ? (
            <p className="mt-1 text-sm italic text-muted-foreground">[deleted]</p>
          ) : (
            <p className="mt-1 whitespace-pre-wrap text-sm">{node.body}</p>
          )}
          <div className="mt-1 flex items-center gap-3">
            {viewerId && canReply ? (
              <button
                type="button"
                onClick={() => setReplyOpen((v) => !v)}
                className="text-[12px] font-semibold text-muted-foreground hover:text-foreground"
              >
                Reply
              </button>
            ) : null}
            {viewerId && node.userId === viewerId && !node.isDeleted ? (
              <button
                type="button"
                onClick={handleDeleteClick}
                className="text-[12px] font-semibold text-muted-foreground hover:text-pink"
              >
                Delete
              </button>
            ) : null}
            {canModerate && viewerId && node.userId !== viewerId && !node.isDeleted ? (
              <button
                type="button"
                onClick={handleModerateRemoveClick}
                disabled={moderating}
                className="text-[12px] font-semibold text-muted-foreground hover:text-pink disabled:opacity-40"
              >
                Remove
              </button>
            ) : null}
          </div>
          {replyOpen ? (
            <div className="mt-2">
              <Composer
                onSubmit={handleReplySubmit}
                onCancel={() => setReplyOpen(false)}
                pending={pending}
                error={error}
                autoFocus
              />
            </div>
          ) : null}
        </div>
      </div>
      {node.children.map((child) => (
        <PostItem
          key={child.id}
          node={child}
          depth={depth + 1}
          viewerId={viewerId}
          onReply={onReply}
          onDelete={onDelete}
          doReply={doReply}
          canReply={canReply}
          canModerate={canModerate}
          onModerateRemove={onModerateRemove}
        />
      ))}
    </div>
  );
}

export function ThreadView({
  threadId,
  initialPosts,
  createReply,
  canReply = true,
  canModerate = false,
  onModerateRemove,
}: {
  threadId: string;
  initialPosts: DiscussionPost[];
  createReply?: (threadId: string, parentPostId: string | null, body: string) => Promise<{ ok: true } | { ok: false; error: "empty" | "too_long" | "unknown" | string }>;
  canReply?: boolean;
  canModerate?: boolean;
  onModerateRemove?: (postId: string) => Promise<void>;
}) {
  const [posts, setPosts] = useState<DiscussionPost[]>(initialPosts);
  const [viewerId, setViewerId] = useState<string | null>(null);
  const [topPending, setTopPending] = useState(false);
  const [topError, setTopError] = useState<string | null>(null);
  const cancelledRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    cancelledRef.current = false;
    async function loadViewer() {
      try {
        const { data } = await supabaseBrowser().auth.getUser();
        if (cancelled) return;
        setViewerId(data.user?.id ?? null);
      } catch {
        // signed-out / unconfigured: leave viewerId null
      }
    }
    void loadViewer();
    return () => {
      cancelled = true;
      cancelledRef.current = true;
    };
  }, []);

  async function refetch() {
    try {
      const list = await getThreadPosts(supabaseBrowser(), threadId);
      if (cancelledRef.current) return;
      setPosts(list);
    } catch {
      // keep existing posts on refetch failure
    }
  }

  async function handleReply(_parentPostId: string, _body: string) {
    await refetch();
  }

  async function handleDelete(postId: string) {
    try {
      await deletePost(supabaseBrowser(), postId);
    } finally {
      await refetch();
    }
  }

  const doReply = createReply
    ? (parentPostId: string | null, body: string) => createReply(threadId, parentPostId, body)
    : (parentPostId: string | null, body: string) => createPost(supabaseBrowser(), viewerId as string, threadId, parentPostId, body);

  async function handleTopSubmit(body: string) {
    if (!viewerId) return;
    setTopPending(true);
    setTopError(null);
    try {
      const result = await doReply(null, body);
      if (result.ok) {
        await refetch();
      } else {
        setTopError(ERROR_COPY[result.error as "empty" | "too_long" | "unknown"] ?? ERROR_COPY.unknown);
      }
    } finally {
      if (!cancelledRef.current) setTopPending(false);
    }
  }

  const tree = buildPostTree(posts);

  return (
    <div>
      {viewerId && canReply ? (
        <div className="mb-4">
          <Composer onSubmit={handleTopSubmit} pending={topPending} error={topError} />
        </div>
      ) : null}
      <div className="divide-y divide-border">
        {tree.map((node) => (
          <PostItem
            key={node.id}
            node={node}
            depth={0}
            viewerId={viewerId}
            onReply={handleReply}
            onDelete={handleDelete}
            doReply={(pid, body) => doReply(pid, body)}
            canReply={canReply}
            canModerate={canModerate}
            onModerateRemove={onModerateRemove}
          />
        ))}
      </div>
    </div>
  );
}
