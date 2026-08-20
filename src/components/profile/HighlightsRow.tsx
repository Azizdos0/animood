"use client";

import { useEffect, useState } from "react";
import type { Media } from "@/lib/anilist/types";
import { CompactCard } from "@/components/home/CompactCard";

type Status = "loading" | "error" | "ready";

export function HighlightsRow({ favoriteIds }: { favoriteIds: number[] }) {
  const [media, setMedia] = useState<Media[]>([]);
  const [status, setStatus] = useState<Status>("loading");

  const idsKey = favoriteIds.join(",");
  useEffect(() => {
    if (favoriteIds.length === 0) return;
    const controller = new AbortController();
    fetch(`/api/media?ids=${idsKey}`, { signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) return setStatus("error");
        const body = (await res.json()) as { items: Media[] };
        setMedia(body.items);
        setStatus("ready");
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setStatus("error");
      });
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey]);

  if (favoriteIds.length === 0) return null;

  if (status === "loading") {
    return (
      <div className="flex gap-3 overflow-hidden">
        {Array.from({ length: Math.min(favoriteIds.length, 4) }).map((_, i) => (
          <div key={i} className="skeleton h-[72px] w-[220px] shrink-0 rounded-2xl" />
        ))}
      </div>
    );
  }

  if (status === "error" || media.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-3">
      {media.map((m) => (
        <div key={m.id} className="w-full sm:w-auto sm:min-w-[220px]">
          <CompactCard media={m} />
        </div>
      ))}
    </div>
  );
}
