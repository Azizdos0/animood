"use client";

import { useEffect, useState } from "react";
import { useListStore } from "@/lib/list/reactive";
import { groupIdsByStatus } from "@/lib/list/grouping";
import { LIST_STATUSES } from "@/lib/list/schema";
import { MediaCard, type MediaCardData } from "@/components/MediaCard";

export function MyListView() {
  const store = useListStore();
  const ids = Object.keys(store.entries).map(Number);
  const [cards, setCards] = useState<Record<number, MediaCardData>>({});

  useEffect(() => {
    if (ids.length === 0) return;
    const controller = new AbortController();
    fetch(`/api/media?ids=${ids.join(",")}`, { signal: controller.signal })
      .then((r) => r.json())
      .then((body: { items: MediaCardData[] }) => {
        const map: Record<number, MediaCardData> = {};
        for (const item of body.items) map[item.id] = item;
        setCards(map);
      })
      .catch(() => {});
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids.join(",")]);

  if (ids.length === 0) {
    return (
      <div className="py-16 text-center">
        <p className="text-sm opacity-70">
          Your list is empty. Browse titles and add them to get started.
        </p>
      </div>
    );
  }

  const grouped = groupIdsByStatus(store);

  return (
    <div className="space-y-10">
      {LIST_STATUSES.filter((s) => grouped[s].length > 0).map((status) => (
        <section key={status} className="space-y-3">
          <h2 className="text-lg font-semibold capitalize">
            {status} ({grouped[status].length})
          </h2>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
            {grouped[status].map((id) =>
              cards[id] ? (
                <MediaCard key={id} media={cards[id]} />
              ) : (
                <div key={id} className="aspect-[2/3] animate-pulse rounded-lg bg-black/10 dark:bg-white/10" />
              )
            )}
          </div>
        </section>
      ))}
    </div>
  );
}
