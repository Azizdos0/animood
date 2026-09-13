"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useListStore, setEntry } from "@/lib/list/reactive";
import type { ListEntry } from "@/lib/list/schema";
import type { MediaType } from "@/lib/anilist/types";
import { presentRecommendations } from "@/lib/recommend/present";
import type { ScoredCandidate } from "@/lib/recommend/scoring";
import type { TasteProfile } from "@/lib/recommend/types";
import { discoveryHref, getMood, type MoodId } from "@/lib/recommend/moods";
import { useDiscoveryPreferences, updateDiscoveryPreferences, getDiscoverySnapshot } from "@/lib/recommend/preferences";
import { MoodChoices } from "./discovery/MoodChoices";
import { TasteStarter } from "./discovery/TasteStarter";

const GENRE_OPTIONS = ["Ecchi", "Horror", "Sports", "Mahou Shoujo", "Romance", "Drama"];
interface Result { key: string; pool: ScoredCandidate[]; profile: TasteProfile | null; partial?: boolean; error?: boolean }

/** Rating and status changes should refresh taste; progress edits should not. */
export function buildListKey(entries: Record<number, ListEntry>): string {
  return Object.entries(entries).map(([id, e]) => `${id}:${e.score ?? ""}:${e.status}`).sort().join(",");
}

export function RecommendationsView({ moodId = null, mediaType = "ANIME" }: { moodId?: MoodId | null; mediaType?: MediaType }) {
  const store = useListStore();
  const preferences = useDiscoveryPreferences();
  const listKey = buildListKey(store.entries);
  const seedKey = preferences.seeds.map((s) => s.id).join(",");
  const [result, setResult] = useState<Result | null>(null);
  const [retry, setRetry] = useState(0);
  const [starterScope, setStarterScope] = useState<string | null>(null);
  const [lastHidden, setLastHidden] = useState<{ scope: string; id: number; title: string } | null>(null);
  const mood = getMood(moodId);
  const requestKey = `${preferences.scope}|${listKey}|${seedKey}|${moodId}|${mediaType}|${retry}`;
  const loading = result?.key !== requestKey;
  const current = loading ? null : result;

  useEffect(() => {
    const controller = new AbortController();
    const list = Object.entries(store.entries).map(([id, e]) => ({ id: Number(id), score: e.score, status: e.status }));
    fetch("/api/recommendations", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ list, seeds: preferences.seeds.map((s) => s.id), mood: moodId, type: mediaType }), signal: controller.signal,
    }).then(async (res) => {
      if (!res.ok) throw new Error("Discovery unavailable");
      const body = await res.json() as Omit<Result, "key">;
      if (!controller.signal.aborted) setResult({ ...body, key: requestKey });
    }).catch(() => {
      if (!controller.signal.aborted) setResult({ key: requestKey, pool: [], profile: null, error: true });
    });
    return () => controller.abort();
    // requestKey includes all server inputs; progress and local filters need no request.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestKey]);

  const recs = useMemo(() => presentRecommendations(current?.pool ?? [], {
    diversity: preferences.diversity, filters: { genres: preferences.excludedGenres, formats: [] },
    moodId, hiddenIds: preferences.hiddenIds, topN: 24,
  }), [current, preferences.diversity, preferences.excludedGenres, preferences.hiddenIds, moodId]);
  const fingerprint = Object.values(current?.profile?.tags ?? {}).filter((t) => t.affinity > 0.01)
    .sort((a, b) => b.affinity - a.affinity).slice(0, 4);
  const hasTaste = preferences.seeds.length > 0 || Object.values(store.entries).some((e) => e.score !== null);
  const undo = lastHidden?.scope === preferences.scope && preferences.hiddenIds.includes(lastHidden.id) ? lastHidden : null;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <p className="mono text-[11px] tracking-[0.14em] text-muted-foreground">YOUR TASTE. TODAY&apos;S MOOD. SOMETHING NEW.</p>
      </div>
      <MoodChoices selected={moodId} type={mediaType} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href={discoveryHref(null, mediaType)} aria-current={!moodId ? "page" : undefined} className={`text-sm underline underline-offset-4 ${!moodId ? "text-pink" : "text-muted-foreground hover:text-foreground"}`}>No particular mood? Follow my taste ↗</Link>
        <span className="mono text-[10px] tracking-wider text-muted-2">CHANGE YOUR MOOD ANYTIME</span>
      </div>

      {starterScope === preferences.scope ? <TasteStarter key={preferences.scope} initial={preferences.seeds} type={mediaType} onClose={() => setStarterScope(null)} /> :
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-border bg-gradient-to-r from-violet/10 to-pink/5 px-5 py-5 sm:px-7">
          <div><p className="font-extrabold">{hasTaste ? "Your taste is part of the story." : "A mood is a start. Make it yours."}</p>
            <p className="mt-1 text-sm text-muted-foreground">{hasTaste ? "Your ratings and favorites help shape each shortlist." : "Choose three favorites to find more of what you love."}</p></div>
          <button type="button" onClick={() => setStarterScope(preferences.scope)} className="shrink-0 rounded-full border border-violet/60 px-5 py-2.5 text-sm font-extrabold transition-colors hover:bg-violet/20">{preferences.seeds.length ? "Edit favorites" : "Pick 3 favorites"} <span aria-hidden="true">↗</span></button>
        </div>}

      <section aria-labelledby="shortlist-heading" className="space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-4 border-b border-border pb-5">
          <div><p className="mono mb-2 text-[10px] tracking-[0.16em] text-pink">YOUR NEXT {mediaType === "ANIME" ? "WATCH" : "READ"}</p>
            <h2 id="shortlist-heading" className="text-[clamp(28px,4vw,48px)] font-black leading-tight tracking-[-0.04em]">{mood?.heading ?? "A little more your thing."}</h2>
            <p className="mt-2 text-sm text-muted-foreground">{mood ? "Chosen for this feeling, shaped by what you like." : "Explore something new, guided by your favorites and ratings."}</p></div>
          <span role="status" className="mono text-[11px] text-muted-2">{loading ? "FINDING YOUR PICKS…" : current?.error ? "DISCOVERY UNAVAILABLE" : `${recs.length} PICKS TO EXPLORE`}</span>
        </div>

        <details className="rounded-xl border border-border px-5 py-4">
          <summary className="cursor-pointer text-sm font-bold">Refine your picks {preferences.excludedGenres.length ? `· ${preferences.excludedGenres.length} genres hidden` : ""}</summary>
          <div className="mt-5 grid gap-5 md:grid-cols-2">
            <label className="flex flex-col gap-3 text-xs text-muted-foreground">Variety — {preferences.diversity < 0.34 ? "Familiar territory" : preferences.diversity < 0.67 ? "A little adventure" : "Broaden my horizons"}
              <input type="range" min={0} max={1} step={0.01} value={preferences.diversity} onChange={(e) => updateDiscoveryPreferences({ diversity: Number(e.target.value) })} className="w-full accent-[var(--pink)]" /></label>
            <div className="flex flex-wrap gap-2"><span className="w-full text-xs text-muted-foreground">Genres to leave out</span>
              {GENRE_OPTIONS.map((genre) => <button key={genre} type="button" aria-pressed={preferences.excludedGenres.includes(genre)} onClick={() => updateDiscoveryPreferences({ excludedGenres: preferences.excludedGenres.includes(genre) ? preferences.excludedGenres.filter((g) => g !== genre) : [...preferences.excludedGenres, genre] })}
                className={`rounded-full border px-3 py-1.5 text-xs ${preferences.excludedGenres.includes(genre) ? "border-pink bg-pink/15" : "border-border-strong text-muted-foreground"}`}>{genre}</button>)}
            </div>
          </div>
          <p className="mt-4 text-xs text-muted-2">Favorites, hidden picks, and these controls are saved for this account in this browser.</p>
        </details>
        {fingerprint.length > 0 && <p className="text-xs text-muted-foreground">A little of your taste: <span className="text-foreground">{fingerprint.map((t) => t.name).join(" · ")}</span></p>}
        {preferences.hiddenIds.length > 0 && <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground" role="status">
          <span>{undo ? `Hidden: ${undo.title}` : `${preferences.hiddenIds.length} picks hidden`}</span>
          {undo && <button type="button" onClick={() => updateDiscoveryPreferences({ hiddenIds: preferences.hiddenIds.filter((id) => id !== undo.id) })} className="font-bold text-pink underline underline-offset-4">Undo</button>}
          <button type="button" onClick={() => updateDiscoveryPreferences({ hiddenIds: [] })} className="underline underline-offset-4">Reset hidden picks</button>
        </div>}
        {current?.partial && <p className="text-xs text-muted-foreground">Some discovery sources are unavailable. These picks use the sources we could load.</p>}
        {loading ? <div aria-label="Loading recommendations" className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{Array.from({ length: 6 }, (_, i) => <div key={i} className="skeleton aspect-[4/3] rounded-2xl" />)}</div> : current?.error ?
          <div className="rounded-2xl border border-dashed border-border-strong px-5 py-14 text-center"><p className="font-bold">Your next favorite is worth another try.</p><p className="mt-2 text-sm text-muted-foreground">We couldn&apos;t reach the title catalog right now.</p><button type="button" onClick={() => setRetry(retry + 1)} className="mt-5 rounded-full bg-pink px-5 py-2.5 text-sm font-extrabold text-on-accent">Try again</button></div> : recs.length === 0 ?
          <div className="rounded-2xl border border-dashed border-border-strong px-5 py-12 text-center"><p className="font-bold">No picks fit this combination yet.</p><p className="mt-2 text-sm text-muted-foreground">Try another mood or relax your filters to open up the shortlist.</p>{(preferences.excludedGenres.length > 0 || preferences.hiddenIds.length > 0) && <button type="button" onClick={() => updateDiscoveryPreferences({ excludedGenres: [], hiddenIds: [] })} className="mt-4 text-sm text-pink underline">Clear filters and hidden picks</button>}</div> :
          <div className="stagger grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {recs.map((rec, index) => <article key={rec.media.id} className="flex flex-col overflow-hidden rounded-2xl border border-border bg-surface transition-colors hover:border-pink/60">
              <Link href={`/media/${rec.media.id}`} aria-label={`View details for ${rec.media.title}`} tabIndex={-1} className="stripe-fill relative block aspect-[16/10] overflow-hidden">
                {rec.media.bannerImage || rec.media.coverImage ? /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={rec.media.bannerImage ?? rec.media.coverImage!} alt="" loading="lazy" className="h-full w-full object-cover" /> : <span aria-hidden="true" className="absolute inset-0 flex items-center justify-center text-7xl text-pink/40">{mood?.symbol ?? "✦"}</span>}
                <span className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-background/80 to-transparent" />
                <span className="mono absolute bottom-3 left-4 rounded-full bg-background/90 px-3 py-1.5 text-[10px] text-pink">{index === 0 ? "START HERE · " : ""}{rec.affinityLabel.toUpperCase()}</span>
              </Link>
              <div className="flex flex-1 flex-col p-5">
                <div className="mono mb-2 text-[10px] text-muted-2">{[rec.media.format?.replaceAll("_", " "), mediaType === "ANIME" && rec.media.episodes ? `${rec.media.episodes} EPISODES` : mediaType === "MANGA" && rec.media.chapters ? `${rec.media.chapters} CHAPTERS` : null, rec.media.seasonYear].filter(Boolean).join(" · ")}</div>
                <Link href={`/media/${rec.media.id}`} className="text-xl font-black leading-tight tracking-tight hover:text-pink">{rec.media.title}</Link>
                <div className="mb-5 mt-3 space-y-1.5 text-xs leading-relaxed text-muted-foreground">
                  {rec.moodReason && <p><span className="font-bold text-pink">For this mood:</span> {rec.moodReason}.</p>}
                  {rec.reasonTags.length > 0 ? <p>Because you like {rec.reasonTags.join(" and ")}.</p> : !rec.moodReason && <p>A discovery pick to help you find your next favorite.</p>}
                </div>
                <div className="mt-auto flex flex-wrap gap-2">
                  <button type="button" onClick={() => setEntry(rec.media.id, { status: "planning" })} className="rounded-full bg-foreground px-4 py-2 text-xs font-extrabold text-background hover:bg-pink">Add to list</button>
                  <button type="button" onClick={() => { const latest = getDiscoverySnapshot(); updateDiscoveryPreferences({ hiddenIds: [...latest.hiddenIds, rec.media.id] }); setLastHidden({ scope: latest.scope, id: rec.media.id, title: rec.media.title }); }} className="rounded-full border border-border-strong px-4 py-2 text-xs font-bold text-muted-foreground hover:border-foreground hover:text-foreground">Not for me</button>
                </div>
              </div>
            </article>)}
          </div>}
      </section>
    </div>
  );
}
