"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useListStore } from "@/lib/list/reactive";
import { groupIdsByStatus } from "@/lib/list/grouping";
import { LIST_STATUSES } from "@/lib/list/schema";
import { MediaCard, type MediaCardData } from "@/components/MediaCard";

type FetchStatus = "loading" | "error" | "done";

export function MyListView() {
  const store = useListStore();
  const ids = Object.keys(store.entries).map(Number);
  const [cards, setCards] = useState<Record<number, MediaCardData>>({});
  const [status, setStatus] = useState<FetchStatus>("loading");

  useEffect(() => {
    if (ids.length === 0) return;
    const controller = new AbortController();
    fetch(`/api/media?ids=${ids.join(",")}`, { signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) {
          setStatus("error");
          return;
        }
        const body = (await res.json()) as { items: MediaCardData[] };
        setCards((prev) => {
          const next = { ...prev };
          for (const item of body.items) next[item.id] = item;
          return next;
        });
        setStatus("done");
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setStatus("error");
      });
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
      {status === "error" ? (
        <p className="py-12 text-center text-sm opacity-70">
          Couldn&apos;t load your titles right now. Please try again later.
        </p>
      ) : null}
      {LIST_STATUSES.filter((s) => grouped[s].length > 0).map((listStatus) => (
        <section key={listStatus} className="space-y-3">
          <h2 className="text-lg font-semibold capitalize">
            {listStatus} ({grouped[listStatus].length})
          </h2>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
            {grouped[listStatus].map((id) => {
              if (cards[id]) {
                return <MediaCard key={id} media={cards[id]} />;
              }
              if (status === "loading") {
                return (
                  <div
                    key={id}
                    className="aspect-[2/3] animate-pulse rounded-lg bg-black/10 dark:bg-white/10"
                  />
                );
              }
              return (
                <Link
                  key={id}
                  href={`/media/${id}`}
                  className="flex aspect-[2/3] flex-col items-center justify-center rounded-lg bg-black/5 p-2 text-center text-xs opacity-60 hover:opacity-80 dark:bg-white/5"
                >
                  Title unavailable
                </Link>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
