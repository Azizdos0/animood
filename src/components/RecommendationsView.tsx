"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useListStore } from "@/lib/list/reactive";
import type { ListEntry } from "@/lib/list/schema";
import { MediaCard } from "@/components/MediaCard";
import { presentRecommendations } from "@/lib/recommend/present";
import type { ScoredCandidate } from "@/lib/recommend/scoring";
import type { ExclusionFilters } from "@/lib/recommend/filters";

type Status = "idle" | "loading" | "error" | "cold" | "ready";

const GENRE_OPTIONS = ["Ecchi", "Horror", "Hentai", "Sports", "Mahou Shoujo", "Kids"];

/**
 * Pure key derivation for the refetch effect: includes id, score, and status
 * for every entry so a re-score or status change (not just membership)
 * invalidates the cached recommendations. Exported for testability.
 */
export function buildListKey(entries: Record<number, ListEntry>): string {
  return Object.entries(entries)
    .map(([id, e]) => `${id}:${e.score ?? ""}:${e.status}`)
    .sort()
    .join(",");
}

export function RecommendationsView() {
  const store = useListStore();
  const listKey = buildListKey(store.entries);

  const [pool, setPool] = useState<ScoredCandidate[]>([]);
  const [status, setStatus] = useState<Status>("idle");
  const [diversity, setDiversity] = useState(0.3);
  const [excluded, setExcluded] = useState<string[]>([]);

  useEffect(() => {
    const list = Object.entries(store.entries).map(([id, e]) => ({
      id: Number(id), score: e.score, status: e.status,
    }));
    if (list.length === 0) {
      setStatus("cold");
      return;
    }
    setStatus("loading");
    const controller = new AbortController();
    fetch("/api/recommendations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ list }),
      signal: controller.signal,
    })
      .then(async (res) => {
        if (!res.ok) return setStatus("error");
        const body = (await res.json()) as { pool: ScoredCandidate[]; coldStart: boolean };
        if (body.coldStart) return setStatus("cold");
        setPool(body.pool);
        setStatus("ready");
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setStatus("error");
      });
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listKey]);

  const filters: ExclusionFilters = useMemo(() => ({ genres: excluded, formats: [] }), [excluded]);
  const recs = useMemo(
    () => presentRecommendations(pool, { diversity, filters, topN: 30 }),
    [pool, diversity, filters]
  );

  if (status === "cold") {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border py-20 text-center">
        <p className="text-base font-medium">Rate a few titles to unlock recommendations.</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Add shows you love (and score them) — the engine learns your taste.
        </p>
        <Link href="/search" className="mt-5 rounded-xl bg-gradient-to-r from-primary-strong to-accent px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-primary/25 transition-transform hover:scale-[1.03]">
          Find titles
        </Link>
      </div>
    );
  }
  if (status === "loading" || status === "idle") {
    return <p className="py-16 text-center text-sm text-muted-foreground">Analyzing your taste…</p>;
  }
  if (status === "error") {
    return (
      <p className="rounded-2xl border border-dashed border-border py-12 text-center text-sm text-muted-foreground">
        Couldn&apos;t build recommendations right now. Please try again later.
      </p>
    );
  }

  return (
    <div className="space-y-8">
      {/* Controls */}
      <div className="flex flex-col gap-5 rounded-2xl border border-border bg-surface/60 p-5">
        <label className="flex flex-col gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Diversity — {diversity < 0.34 ? "Safe picks" : diversity < 0.67 ? "Balanced" : "Surprise me"}
          </span>
          <input
            type="range" min={0} max={1} step={0.01} value={diversity}
            onChange={(e) => setDiversity(Number(e.target.value))}
            className="w-full accent-[var(--color-accent)]"
          />
        </label>
        <div className="flex flex-wrap gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Hide</span>
          {GENRE_OPTIONS.map((g) => {
            const on = excluded.includes(g);
            return (
              <button
                key={g} type="button"
                onClick={() => setExcluded((prev) => on ? prev.filter((x) => x !== g) : [...prev, g])}
                className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                  on ? "border-destructive bg-destructive/20 text-foreground" : "border-border text-muted-foreground hover:bg-surface-hover"
                }`}
              >
                {g}
              </button>
            );
          })}
        </div>
      </div>

      {recs.length === 0 ? (
        <p className="py-12 text-center text-sm text-muted-foreground">
          No recommendations match those filters — try loosening them.
        </p>
      ) : (
        <div className="stagger grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {recs.map((r) => (
            <div key={r.media.id} className="space-y-2">
              <MediaCard media={{ id: r.media.id, title: r.media.title, coverImage: r.media.coverImage, format: r.media.format }} />
              {r.reasonTags.length > 0 ? (
                <p className="px-0.5 text-[11px] leading-tight text-muted-foreground">
                  <span className="text-accent">Because you like</span> {r.reasonTags.join(", ")}
                </p>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
