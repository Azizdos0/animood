"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { setProfileVisibility } from "@/lib/profile/queries";
import { supabaseBrowser } from "@/lib/supabase/client";

export function ProfileOwnerBar({ userId, isPublic }: { userId: string; isPublic: boolean }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function toggle() {
    if (pending) return;
    setPending(true);
    try {
      await setProfileVisibility(supabaseBrowser(), userId, !isPublic);
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-surface/40 p-4">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="mono rounded-full border border-border-strong px-2 py-0.5 text-[10px] text-muted-foreground">
            This is you
          </span>
          <span className="text-sm font-bold">
            {isPublic ? "Public profile" : "Private profile"}
          </span>
        </div>
        <p className="mono mt-1 text-[11px] tracking-[0.06em] text-muted-2">
          {isPublic
            ? "Anyone with the link can see your list."
            : "Only you can see this — it is hidden from other visitors."}
        </p>
      </div>
      <button
        type="button"
        onClick={toggle}
        disabled={pending}
        className="inline-flex shrink-0 items-center gap-2 rounded-full border border-border-strong bg-surface px-5 py-2.5 text-sm font-bold transition-colors hover:border-foreground disabled:opacity-60"
      >
        {isPublic ? "Make private" : "Make public"}
      </button>
    </div>
  );
}
