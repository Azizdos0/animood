"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useListStore, setEntry } from "@/lib/list/reactive";
import type { ListEntry } from "@/lib/list/schema";
import { presentRecommendations } from "@/lib/recommend/present";
import type { ScoredCandidate } from "@/lib/recommend/scoring";
import type { ExclusionFilters } from "@/lib/recommend/filters";
import type { TasteProfile } from "@/lib/recommend/types";

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
  const [profile, setProfile] = useState<TasteProfile | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [diversity, setDiversity] = useState(0.3);
  const [excluded, setExcluded] = useState<string[]>([]);
  const [dismissed, setDismissed] = useState<Set<number>>(new Set());

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
        const body = (await res.json()) as { pool: ScoredCandidate[]; profile: TasteProfile | null; coldStart: boolean };
        if (body.coldStart) return setStatus("cold");
        setPool(body.pool);
        setProfile(body.profile);
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
    () => presentRecommendations(pool, { diversity, filters, topN: 24 }).filter((r) => !dismissed.has(r.media.id)),
    [pool, diversity, filters, dismissed]
  );

  // Normalized "match" from base scores across the pool.
  const matchOf = useMemo(() => {
    const bases = pool.map((c) => c.base);
    const min = Math.min(...bases, 0);
    const max = Math.max(...bases, 1);
    const map = new Map<number, number>();
    for (const c of pool) {
      const norm = max === min ? 1 : (c.base - min) / (max - min);
      map.set(c.media.id, Math.round(70 + norm * 29));
    }
    return map;
  }, [pool]);

  const fingerprint = useMemo(() => {
    if (!profile) return [];
    const tags = Object.values(profile.tags).filter((t) => t.affinity > 0.01);
    const max = Math.max(1, ...tags.map((t) => t.affinity));
    return tags.sort((a, b) => b.affinity - a.affinity).slice(0, 7)
      .map((t) => ({ name: t.name, pct: Math.round((t.affinity / max) * 100) }));
  }, [profile]);

  if (status === "cold") {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border py-20 text-center">
        <p className="mono text-xs tracking-[0.14em] text-muted-2">RATE A FEW TITLES TO UNLOCK RECOMMENDATIONS</p>
        <p className="mt-3 text-sm text-muted-foreground">Add shows you love and score them — the engine learns your taste.</p>
        <Link href="/search" className="mt-6 rounded-full bg-foreground px-5 py-2.5 text-sm font-extrabold text-background transition-colors hover:bg-pink">
          Find titles
        </Link>
      </div>
    );
  }
  if (status === "loading" || status === "idle") {
    return (
      <div className="space-y-4">
        <p className="mono text-xs tracking-[0.14em] text-muted-2">ANALYZING YOUR TASTE…</p>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => <div key={i} className="skeleton aspect-[16/10] rounded-2xl" />)}
        </div>
      </div>
    );
  }
  if (status === "error") {
    return (
      <p className="mono rounded-2xl border border-dashed border-border py-12 text-center text-xs tracking-[0.12em] text-muted-2">
        COULDN&apos;T BUILD RECOMMENDATIONS RIGHT NOW — TRY AGAIN LATER
      </p>
    );
  }

  return (
    <div className="space-y-9">
      {/* Taste fingerprint + controls */}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        {fingerprint.length > 0 ? (
          <div className="rounded-2xl border border-border bg-surface p-6">
            <div className="mono mb-4 text-[10px] tracking-[0.14em] text-muted-2">TASTE FINGERPRINT</div>
            <div className="flex flex-col gap-2.5">
              {fingerprint.map((g) => (
                <div key={g.name} className="flex items-center gap-3.5">
                  <span className="w-28 shrink-0 text-[13px] font-bold">{g.name}</span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-border">
                    <div className="h-full rounded-full bg-gradient-to-r from-pink to-violet" style={{ width: `${g.pct}%` }} />
                  </div>
                  <span className="mono w-10 text-right text-[11px] text-muted-foreground">{g.pct}%</span>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        <div className="flex flex-col gap-5 rounded-2xl border border-border bg-surface p-6">
          <label className="flex flex-col gap-2.5">
            <span className="mono text-[10px] tracking-[0.14em] text-muted-2">
              DIVERSITY — {diversity < 0.34 ? "SAFE PICKS" : diversity < 0.67 ? "BALANCED" : "SURPRISE ME"}
            </span>
            <input
              type="range" min={0} max={1} step={0.01} value={diversity}
              onChange={(e) => setDiversity(Number(e.target.value))}
              className="w-full accent-[var(--pink)]"
            />
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <span className="mono text-[10px] tracking-[0.14em] text-muted-2">HIDE</span>
            {GENRE_OPTIONS.map((g) => {
              const on = excluded.includes(g);
              return (
                <button
                  key={g} type="button"
                  onClick={() => setExcluded((prev) => on ? prev.filter((x) => x !== g) : [...prev, g])}
                  className={`mono rounded-full border px-3 py-1.5 text-[11px] tracking-[0.06em] transition-colors ${
                    on ? "border-pink bg-pink/15 text-foreground" : "border-border-strong text-muted-foreground hover:border-foreground hover:text-foreground"
                  }`}
                >
                  {g.toUpperCase()}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="mono flex items-baseline gap-4">
        <span className="text-[11px] tracking-[0.16em] text-pink">PICKED FOR TONIGHT</span>
        <span className="text-[10px] tracking-[0.14em] text-muted-2">REFRESHES WITH YOUR LIST</span>
      </div>

      {recs.length === 0 ? (
        <p className="mono py-12 text-center text-xs tracking-[0.12em] text-muted-2">
          NO RECOMMENDATIONS MATCH THOSE FILTERS — TRY LOOSENING THEM
        </p>
      ) : (
        <div className="stagger grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {recs.map((r) => (
            <div key={r.media.id} className="flex flex-col overflow-hidden rounded-2xl border border-border bg-surface transition-colors hover:border-pink">
              <Link href={`/media/${r.media.id}`} className="relative block aspect-[16/10] stripe-fill">
                {r.media.bannerImage || r.media.coverImage ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={r.media.bannerImage ?? r.media.coverImage!} alt={r.media.title} loading="lazy" className="h-full w-full object-cover" />
                ) : null}
                <span className="mono absolute right-3 top-3 rounded-full bg-background/85 px-2.5 py-1.5 text-[10px] tracking-[0.06em] text-pink">
                  {matchOf.get(r.media.id) ?? 80}% MATCH
                </span>
              </Link>
              <div className="p-5">
                <Link href={`/media/${r.media.id}`} className="text-[19px] font-black leading-tight tracking-[-0.025em] transition-colors hover:text-pink">
                  {r.media.title}
                </Link>
                {r.reasonTags.length > 0 ? (
                  <div className="mono mt-2 text-[10px] leading-relaxed text-muted-2">
                    BECAUSE YOU LIKE {r.reasonTags.join(", ").toUpperCase()}
                  </div>
                ) : null}
                <div className="mt-4 flex gap-2">
                  <button
                    type="button"
                    onClick={() => { setEntry(r.media.id, { status: "planning" }); setDismissed((p) => new Set(p).add(r.media.id)); }}
                    className="rounded-full bg-foreground px-4 py-2 text-[12px] font-extrabold text-background transition-colors hover:bg-pink"
                  >
                    Add to list
                  </button>
                  <button
                    type="button"
                    onClick={() => setDismissed((p) => new Set(p).add(r.media.id))}
                    className="rounded-full border border-border-strong px-4 py-2 text-[12px] font-bold text-muted-foreground transition-colors hover:border-foreground hover:text-foreground"
                  >
                    Not for me
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
