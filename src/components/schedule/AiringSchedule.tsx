"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { Media } from "@/lib/anilist/types";
import { useListStore } from "@/lib/list/reactive";
import { episodesBehind, formatCountdown, groupByDay, type ScheduleItem } from "@/lib/schedule/airing";
import { useNow } from "@/lib/schedule/useNow";

// Shows the viewer is following. Capped so one request stays small.
const FOLLOWED = new Set(["watching", "planning", "onhold"]);
const MAX_FOLLOWED = 100;
const NONE: Media[] = [];

type View = "mine" | "all";

export function AiringSchedule({ popular, failed }: { popular: Media[]; failed: boolean }) {
  const store = useListStore();
  const now = useNow();
  const followedIds = useMemo(() => Object.entries(store.entries)
    .filter(([, e]) => FOLLOWED.has(e.status)).map(([id]) => Number(id)).slice(0, MAX_FOLLOWED), [store]);
  const key = followedIds.join(",");
  const [mine, setMine] = useState<{ key: string; items: Media[] }>({ key: "", items: [] });
  const [chosen, setChosen] = useState<View | null>(null);

  useEffect(() => {
    if (!key) return;
    const controller = new AbortController();
    fetch(`/api/media?ids=${key}`, { signal: controller.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((body: { items: Media[] }) => setMine({ key, items: body.items }))
      .catch(() => {});
    return () => controller.abort();
  }, [key]);

  const myMedia = mine.key === key ? mine.items : NONE;
  const followed = useMemo(() => new Set(followedIds), [followedIds]);
  const days = useMemo(() => now === null ? [] : groupByDay([
    ...myMedia.map((media) => ({ media, mine: true })),
    ...popular.map((media) => ({ media, mine: followed.has(media.id) })),
  ], now), [now, myMedia, popular, followed]);

  const myCount = days.reduce((n, d) => n + d.items.filter((i) => i.mine).length, 0);
  // Default to the viewer's shows when they have any this week.
  const view: View = chosen ?? (myCount > 0 ? "mine" : "all");

  if (now === null) return <ScheduleSkeleton />;

  const visible = days.map((d) => ({ ...d, items: view === "mine" ? d.items.filter((i) => i.mine) : d.items }));
  const empty = visible.every((d) => d.items.length === 0);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <p className="text-sm text-muted-foreground">
          Next episodes over the coming week, in your local time.
        </p>
        <div role="group" aria-label="Schedule filter" className="flex rounded-full border border-border-strong p-1">
          {([["mine", `My shows · ${myCount}`], ["all", "All airing"]] as const).map(([value, label]) => (
            <button key={value} type="button" aria-pressed={view === value} onClick={() => setChosen(value)}
              className={`rounded-full px-5 py-2 text-xs font-extrabold ${view === value ? "bg-foreground text-background" : "text-muted-foreground hover:text-pink"}`}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {failed && (
        <p className="mono rounded-2xl border border-dashed border-border py-4 text-center text-xs tracking-[0.14em] text-muted-2">
          THE FULL SCHEDULE IS UNAVAILABLE RIGHT NOW{myCount > 0 ? " — SHOWING YOUR SHOWS" : ""}
        </p>
      )}

      {empty ? (
        <div className="rounded-2xl border border-dashed border-border py-14 text-center">
          <p className="font-bold">{view === "mine" ? "None of your shows air this week." : "Nothing scheduled this week."}</p>
          {view === "mine" && (
            <p className="mt-2 text-sm text-muted-foreground">
              Add airing shows to <Link href="/my-list" className="text-pink underline underline-offset-4">your list</Link> as
              watching or planning, or <button type="button" onClick={() => setChosen("all")} className="text-pink underline underline-offset-4">browse everything airing</button>.
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-8">
          {visible.filter((d) => d.items.length > 0).map((day) => (
            <section key={day.key} aria-labelledby={`day-${day.key}`}>
              <h2 id={`day-${day.key}`} className="mb-3 flex items-baseline gap-3">
                <span className="text-xl font-black tracking-[-0.03em]">{day.label}</span>
                <span className="mono text-[11px] text-muted-2">
                  {day.date.toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                </span>
              </h2>
              <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                {day.items.map((item) => (
                  <ScheduleRow key={item.media.id} item={item} now={now} badge={view === "all"}
                    watchedTo={store.entries[item.media.id]?.status === "watching" ? store.entries[item.media.id].progress : undefined} />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function ScheduleRow({ item, now, badge, watchedTo }: {
  item: ScheduleItem; now: number; badge: boolean; watchedTo?: number;
}) {
  const time = new Date(item.airingAt * 1000).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  const behind = watchedTo === undefined ? 0 : episodesBehind(watchedTo, item.media.nextAiringEpisode, now);
  return (
    <li className="flex items-center gap-4 rounded-2xl border border-border bg-surface p-3.5">
      <Link href={`/media/${item.media.id}`} className="h-16 w-11 shrink-0 overflow-hidden rounded-lg stripe-fill">
        {item.media.coverImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.media.coverImage} alt="" className="h-full w-full object-cover" />
        ) : null}
      </Link>
      <div className="min-w-0 flex-1">
        <Link href={`/media/${item.media.id}`} className="block truncate text-[15px] font-extrabold hover:text-pink">
          {item.media.title}
        </Link>
        <div className="mono mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-2">
          <span>EP {item.episode}{item.media.episodes ? ` / ${item.media.episodes}` : ""}</span>
          <span>{time}</span>
          <span className="text-foreground">{formatCountdown(item.airingAt, now)}</span>
        </div>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        {badge && item.mine && <span className="rounded-full bg-pink/15 px-2.5 py-1 text-[10px] font-bold text-pink">On your list</span>}
        {behind > 0 && <span className="text-[10px] font-semibold text-muted-foreground">{behind} to catch up</span>}
      </div>
    </li>
  );
}

function ScheduleSkeleton() {
  return (
    <div aria-hidden="true" className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: 6 }, (_, i) => <div key={i} className="h-[92px] animate-pulse rounded-2xl bg-surface" />)}
    </div>
  );
}
