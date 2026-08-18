"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useListStore } from "@/lib/list/reactive";
import type { Media } from "@/lib/anilist/types";
import type { ListEntry } from "@/lib/list/schema";
import type { StatEntry } from "@/lib/stats/types";
import { scoreDistribution, statusBreakdown, computeTotals, listTotals } from "@/lib/stats/compute";
import { genreBreakdown, topTags, formatBreakdown, tasteAffinitySummary } from "@/lib/stats/breakdowns";
import { formatMinutes, formatNumber } from "@/lib/stats/format";
import { STATUS_LABELS } from "@/lib/list/labels";
import { StatTile } from "@/components/stats/StatTile";
import { BarList } from "@/components/stats/BarList";
import { ScoreHistogram } from "@/components/stats/ScoreHistogram";
import { AffinityBars } from "@/components/stats/AffinityBars";

type Status = "loading" | "error" | "ready";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4 rounded-2xl border border-border bg-surface/40 p-5">
      <h2 className="font-display text-lg font-bold tracking-tight">{title}</h2>
      {children}
    </section>
  );
}

export function StatsView() {
  const store = useListStore();
  const ids = Object.keys(store.entries).map(Number);
  const [media, setMedia] = useState<Record<number, Media>>({});
  const [status, setStatus] = useState<Status>("loading");

  const listKey = ids.join(",");
  useEffect(() => {
    if (ids.length === 0) return;
    const controller = new AbortController();
    fetch(`/api/media?ids=${listKey}`, { signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) return setStatus("error");
        const body = (await res.json()) as { items: Media[] };
        const map: Record<number, Media> = {};
        for (const m of body.items) map[m.id] = m;
        setMedia(map);
        setStatus("ready");
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setStatus("error");
      });
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listKey]);

  if (ids.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border py-20 text-center">
        <p className="text-base font-medium">No stats yet.</p>
        <p className="mt-1 text-sm text-muted-foreground">Add titles to your list to see your habits.</p>
        <Link href="/search" className="mt-5 rounded-xl bg-gradient-to-r from-primary-strong to-accent px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-primary/25 transition-transform hover:scale-[1.03]">
          Find titles
        </Link>
      </div>
    );
  }
  if (status === "loading") return <p className="py-16 text-center text-sm text-muted-foreground">Crunching your stats…</p>;
  if (status === "error") {
    return (
      <p className="rounded-2xl border border-dashed border-border py-12 text-center text-sm text-muted-foreground">
        Couldn&apos;t load your stats right now. Please try again later.
      </p>
    );
  }

  // Full list-level entries (every id in the store), independent of whether
  // `/api/media` returned metadata for it. Titles/status/completion/score
  // stats are derived from this so they never undercount vs. My List.
  const listEntries: ListEntry[] = Object.values(store.entries);

  // Metadata-dependent subset — only ids the media API actually returned.
  const entries: StatEntry[] = ids
    .filter((id) => media[id])
    .map((id) => ({ media: media[id], entry: store.entries[id] }));

  const list = listTotals(listEntries);
  const totals = computeTotals(entries);
  const dist = scoreDistribution(listEntries);
  const genres = genreBreakdown(entries).slice(0, 10);
  const tags = topTags(entries, 10);
  const formats = formatBreakdown(entries);
  const statuses = statusBreakdown(listEntries)
    .filter((s) => s.count > 0)
    .map((s) => ({ name: STATUS_LABELS[s.status], count: s.count }));
  const affinity = tasteAffinitySummary(entries);
  const titlesSub =
    totals.anime + totals.manga === list.titles
      ? `${totals.anime} anime · ${totals.manga} manga`
      : "in your list";

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        <StatTile label="Titles" value={formatNumber(list.titles)} sub={titlesSub} />
        <StatTile label="Episodes" value={formatNumber(totals.episodes)} sub="watched" />
        <StatTile label="Time" value={formatMinutes(totals.minutes)} sub="of anime" />
        <StatTile label="Mean score" value={list.meanScore ? list.meanScore.toFixed(1) : "—"} sub="your average" />
        <StatTile label="Completion" value={`${Math.round(list.completionRate * 100)}%`} sub="of your list" />
      </div>

      <Section title="Score distribution"><ScoreHistogram data={dist} /></Section>

      <div className="grid gap-6 md:grid-cols-2">
        <Section title="Top genres"><BarList items={genres} accent="var(--color-primary)" /></Section>
        <Section title="Top tags"><BarList items={tags} accent="var(--color-accent)" /></Section>
        <Section title="Formats"><BarList items={formats} accent="var(--color-primary-strong)" /></Section>
        <Section title="By status"><BarList items={statuses} accent="var(--color-primary)" /></Section>
      </div>

      <Section title="Your taste profile">
        <p className="-mt-1 mb-3 text-xs text-muted-foreground">The tag affinities that power your recommendations.</p>
        <AffinityBars positive={affinity.positive} negative={affinity.negative} />
      </Section>
    </div>
  );
}
