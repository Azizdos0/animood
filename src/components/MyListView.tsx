"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useListStore, setEntry } from "@/lib/list/reactive";
import { groupIdsByStatus } from "@/lib/list/grouping";
import { LIST_STATUSES, type ListStatus } from "@/lib/list/schema";
import { STATUS_LABELS } from "@/lib/list/labels";
import type { Media } from "@/lib/anilist/types";
import { CompassIcon, UploadIcon } from "@/components/icons";

type FetchStatus = "loading" | "error" | "done";

export function MyListView() {
  const store = useListStore();
  const ids = Object.keys(store.entries).map(Number);
  const [cards, setCards] = useState<Record<number, Media>>({});
  const [status, setStatus] = useState<FetchStatus>("loading");
  const [filter, setFilter] = useState<ListStatus | null>(null);

  const listKey = ids.join(",");
  useEffect(() => {
    if (ids.length === 0) return;
    const controller = new AbortController();
    fetch(`/api/media?ids=${listKey}`, { signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) return setStatus("error");
        const body = (await res.json()) as { items: Media[] };
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
  }, [listKey]);

  const grouped = groupIdsByStatus(store);
  const activeStatuses = useMemo(
    () => LIST_STATUSES.filter((s) => grouped[s].length > 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [listKey]
  );
  const selected: ListStatus | null =
    filter && grouped[filter].length > 0 ? filter : activeStatuses[0] ?? null;

  if (ids.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border py-20 text-center">
        <p className="mono text-xs tracking-[0.14em] text-muted-2">YOUR LIST IS EMPTY</p>
        <p className="mt-3 text-sm text-muted-foreground">Browse titles, or import your list from MyAnimeList.</p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Link href="/search" className="inline-flex items-center gap-2 rounded-full bg-foreground px-5 py-2.5 text-sm font-extrabold text-background transition-colors hover:bg-pink">
            <CompassIcon size={16} /> Explore titles
          </Link>
          <Link href="/import" className="inline-flex items-center gap-2 rounded-full border border-border-strong bg-surface px-5 py-2.5 text-sm font-bold transition-colors hover:border-foreground">
            <UploadIcon size={16} /> Import from MyAnimeList
          </Link>
        </div>
      </div>
    );
  }

  const rows = selected ? grouped[selected] : [];

  return (
    <div className="space-y-7">
      {/* Status filter pills */}
      <div className="flex flex-wrap gap-2">
        {activeStatuses.map((s) => {
          const on = s === selected;
          return (
            <button
              key={s}
              type="button"
              onClick={() => setFilter(s)}
              className={`rounded-full px-4.5 py-2.5 text-[13px] font-bold transition-colors ${
                on ? "bg-foreground text-background" : "border border-border-strong text-muted-foreground hover:border-foreground hover:text-foreground"
              }`}
            >
              {STATUS_LABELS[s]} {grouped[s].length}
            </button>
          );
        })}
      </div>

      {status === "error" ? (
        <p className="mono rounded-2xl border border-dashed border-border py-12 text-center text-xs tracking-[0.12em] text-muted-2">
          COULDN&apos;T LOAD YOUR TITLES RIGHT NOW — TRY AGAIN LATER
        </p>
      ) : null}

      {/* Table header */}
      <div className="mono grid grid-cols-[minmax(0,1fr)_44px] items-center gap-4 border-b border-border px-3 pb-3 text-[10px] tracking-[0.14em] text-muted-2 sm:grid-cols-[minmax(0,3fr)_88px_minmax(0,2fr)_72px_44px] sm:px-4">
        <span>TITLE</span>
        <span className="hidden sm:block">TYPE</span>
        <span className="hidden sm:block">PROGRESS</span>
        <span className="hidden sm:block">SCORE</span>
        <span />
      </div>

      {/* Rows */}
      <div>
        {rows.map((id) => {
          const m = cards[id];
          const entry = store.entries[id];
          const isManga = m?.type === "MANGA";
          const total = m ? (isManga ? m.chapters : m.episodes) : null;
          const pct = total ? Math.min(100, Math.round((entry.progress / total) * 100)) : 0;
          return (
            <div
              key={id}
              className="grid grid-cols-[minmax(0,1fr)_44px] items-center gap-4 border-b border-border/60 px-3 py-3.5 transition-colors hover:bg-surface sm:grid-cols-[minmax(0,3fr)_88px_minmax(0,2fr)_72px_44px] sm:px-4"
            >
              <Link href={`/media/${id}`} className="flex min-w-0 items-center gap-3.5">
                <div className="h-[54px] w-[38px] shrink-0 overflow-hidden rounded-md stripe-fill">
                  {m?.coverImage ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={m.coverImage} alt="" className="h-full w-full object-cover" />
                  ) : null}
                </div>
                <span className="truncate text-[15px] font-extrabold tracking-[-0.015em] transition-colors hover:text-pink">
                  {m?.title ?? (status === "done" ? "Title unavailable" : "…")}
                </span>
              </Link>
              <span className="mono hidden text-[10px] tracking-[0.1em] text-muted-2 sm:block">
                {m?.type ?? (isManga ? "MANGA" : "ANIME")}
              </span>
              <div className="hidden sm:block">
                <div className="mono text-[11px] text-muted-foreground">
                  {entry.progress}
                  {total ? ` / ${total}` : ""}
                </div>
                <div className="mt-2 h-1 overflow-hidden rounded-full bg-border-strong">
                  <div className="h-full rounded-full bg-pink" style={{ width: `${pct}%` }} />
                </div>
              </div>
              <span className="mono hidden text-[13px] text-pink sm:block">
                {entry.score !== null ? `★ ${entry.score}` : "—"}
              </span>
              <button
                type="button"
                aria-label="Add one"
                onClick={() => setEntry(id, { progress: entry.progress + 1 })}
                className="grid h-9 w-9 shrink-0 place-items-center justify-self-end rounded-full border border-border-strong text-[12px] font-bold transition-colors hover:bg-foreground hover:text-background"
              >
                +1
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
