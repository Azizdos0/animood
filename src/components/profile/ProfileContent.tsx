"use client";

import type { ListEntry } from "@/lib/list/schema";
import { HighlightsRow } from "@/components/profile/HighlightsRow";
import { StatsBoard } from "@/components/StatsBoard";
import { MediaList } from "@/components/MediaList";

export function ProfileContent({ entries }: { entries: Record<number, ListEntry> }) {
  const favoriteIds = Object.entries(entries)
    .filter(([, e]) => e.isFavorite)
    .sort(
      (a, b) =>
        (b[1].score ?? -1) - (a[1].score ?? -1) || b[1].updatedAt.localeCompare(a[1].updatedAt)
    )
    .map(([id]) => Number(id));

  return (
    <div className="space-y-8">
      <HighlightsRow favoriteIds={favoriteIds} />
      <StatsBoard entries={entries} showShareCard={false} />
      <MediaList entries={entries} interactive={false} />
    </div>
  );
}
