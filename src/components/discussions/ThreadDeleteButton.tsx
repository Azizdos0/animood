"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";
import { deleteThread } from "@/lib/discussions/queries";

export function ThreadDeleteButton({
  threadId,
  mediaId,
  authorId,
}: {
  threadId: string;
  mediaId: number;
  authorId: string;
}) {
  const router = useRouter();
  const [viewerId, setViewerId] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
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

  async function handleDeleteClick() {
    if (pending) return;
    if (!window.confirm("Delete this thread and all its replies?")) return;
    setPending(true);
    setError(null);
    try {
      await deleteThread(supabaseBrowser(), threadId);
      router.push(`/media/${mediaId}`);
    } catch {
      if (!cancelledRef.current) {
        setError("Couldn't delete this thread.");
        setPending(false);
      }
    }
  }

  if (viewerId !== authorId) return null;

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={handleDeleteClick}
        disabled={pending}
        className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:border-destructive hover:bg-destructive hover:text-white disabled:opacity-40"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <polyline points="3 6 5 6 21 6" />
          <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
          <path d="M10 11v6" />
          <path d="M14 11v6" />
          <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
        </svg>
        {pending ? "Deleting…" : "Delete thread"}
      </button>
      {error ? <span className="text-[12px] text-pink">{error}</span> : null}
    </div>
  );
}
