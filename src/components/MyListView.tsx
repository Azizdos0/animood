"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useListStore } from "@/lib/list/reactive";
import { groupIdsByStatus } from "@/lib/list/grouping";
import { LIST_STATUSES } from "@/lib/list/schema";
import { STATUS_LABELS, STATUS_ACCENTS } from "@/lib/list/labels";
import { MediaCard, type MediaCardData } from "@/components/MediaCard";
import { InboxIcon, UploadIcon, CompassIcon } from "@/components/icons";

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
      <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border py-20 text-center">
        <InboxIcon size={40} className="text-muted-foreground/50" />
        <p className="mt-4 text-base font-medium">Your list is empty.</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Browse titles and add them, or import your list from MyAnimeList.
        </p>
        <div className="mt-5 flex flex-wrap justify-center gap-3">
          <Link
            href="/search"
            className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-primary-strong to-accent px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-primary/25 transition-transform hover:scale-[1.03]"
          >
            <CompassIcon size={16} /> Explore titles
          </Link>
          <Link
            href="/import"
            className="inline-flex items-center gap-2 rounded-xl border border-border-strong bg-surface px-5 py-2.5 text-sm font-semibold transition-colors hover:bg-surface-hover"
          >
            <UploadIcon size={16} /> Import from MyAnimeList
          </Link>
        </div>
      </div>
    );
  }

  const grouped = groupIdsByStatus(store);

  return (
    <div className="space-y-10">
      {status === "error" ? (
        <p className="rounded-2xl border border-dashed border-border py-12 text-center text-sm text-muted-foreground">
          Couldn&apos;t load your titles right now. Please try again later.
        </p>
      ) : null}
      {LIST_STATUSES.filter((s) => grouped[s].length > 0).map((listStatus) => (
        <section key={listStatus} className="space-y-4">
          <div className="flex items-center gap-2.5">
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: STATUS_ACCENTS[listStatus] }}
            />
            <h2 className="font-display text-lg font-bold tracking-tight">
              {STATUS_LABELS[listStatus]}
            </h2>
            <span className="rounded-full bg-surface px-2 py-0.5 text-xs font-medium text-muted-foreground">
              {grouped[listStatus].length}
            </span>
          </div>
          <div className="stagger grid grid-cols-3 gap-3 sm:grid-cols-4 sm:gap-4 md:grid-cols-5 lg:grid-cols-6">
            {grouped[listStatus].map((id) => {
              if (cards[id]) {
                return <MediaCard key={id} media={cards[id]} />;
              }
              if (status === "loading") {
                return <div key={id} className="skeleton aspect-[2/3] rounded-xl" />;
              }
              return (
                <Link
                  key={id}
                  href={`/media/${id}`}
                  className="flex aspect-[2/3] flex-col items-center justify-center rounded-xl border border-border bg-surface p-2 text-center text-xs text-muted-foreground transition-colors hover:bg-surface-hover"
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
