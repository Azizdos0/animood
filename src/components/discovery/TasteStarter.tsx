"use client";

import { useEffect, useState } from "react";
import { updateDiscoveryPreferences, type FavoriteSeed } from "@/lib/recommend/preferences";
import type { MediaType } from "@/lib/anilist/types";

export function TasteStarter({ initial, type, onClose }: { initial: FavoriteSeed[]; type: MediaType; onClose: () => void }) {
  const [selected, setSelected] = useState(initial);
  const [query, setQuery] = useState("");
  const [searchType, setSearchType] = useState(type);
  const key = `${searchType}:${query.trim()}`;
  const [result, setResult] = useState<{ key: string; items: FavoriteSeed[]; error?: boolean } | null>(null);
  const [retry, setRetry] = useState(0);
  const requestKey = `${key}:${retry}`;
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      fetch(`/api/discovery/seeds?type=${searchType}&q=${encodeURIComponent(query.trim())}`, { signal: controller.signal })
        .then(async (res) => {
          if (!res.ok) throw new Error("Search unavailable");
          const data = await res.json() as { items: FavoriteSeed[] };
          if (!controller.signal.aborted) setResult({ key: requestKey, items: data.items });
        }).catch(() => { if (!controller.signal.aborted) setResult({ key: requestKey, items: [], error: true }); });
    }, 300);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [query, searchType, requestKey]);

  return (
    <section aria-label="Pick your favorites" className="rounded-2xl border border-pink/50 bg-surface p-5 sm:p-7">
      <div className="flex items-start justify-between gap-4">
        <div><h2 className="text-2xl font-black tracking-tight">Three favorites. A little more you.</h2>
          <p className="mt-2 text-sm text-muted-foreground">Pick anime or manga you love. These guide your picks without changing your list or ratings.</p></div>
        <button type="button" onClick={onClose} aria-label="Close favorite picker" className="rounded-full border border-border-strong px-3 py-2">✕</button>
      </div>
      <div className="mt-5 flex flex-wrap gap-3">
        <label className="min-w-0 flex-1"><span className="sr-only">Search favorites</span>
          <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search a title you love…" maxLength={150}
            className="w-full rounded-xl border border-border-strong bg-background px-4 py-3 text-sm outline-none focus:border-pink" /></label>
        <label><span className="sr-only">Favorite type</span><select value={searchType} onChange={(e) => setSearchType(e.target.value as MediaType)} className="rounded-xl border border-border-strong bg-background px-4 py-3 text-sm"><option value="ANIME">Anime</option><option value="MANGA">Manga</option></select></label>
      </div>
      <div aria-live="polite" className="mt-4 flex min-h-9 flex-wrap items-center gap-2">
        <span className="mono text-xs text-pink">{selected.length}/3 selected</span>
        {selected.map((seed) => <button key={seed.id} type="button" onClick={() => setSelected(selected.filter((s) => s.id !== seed.id))} aria-label={`Remove ${seed.title}`} className="max-w-full truncate rounded-full bg-pink/15 px-3 py-2 text-xs font-bold">{seed.title} ×</button>)}
      </div>
      {result?.key !== requestKey ? <p role="status" className="py-8 text-sm text-muted-foreground">Finding titles…</p> : result.error ?
        <div className="py-6 text-sm">Couldn&apos;t load titles. <button type="button" onClick={() => setRetry(retry + 1)} className="text-pink underline">Retry search</button></div> :
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {result.items.length === 0 && <p className="col-span-full py-5 text-sm text-muted-foreground">No titles found. Try another name.</p>}
          {result.items.map((seed) => {
            const on = selected.some((s) => s.id === seed.id);
            return <button key={seed.id} type="button" aria-pressed={on} disabled={!on && selected.length === 3} onClick={() => setSelected(on ? selected.filter((s) => s.id !== seed.id) : [...selected, seed])}
              className={`flex items-center gap-3 rounded-xl border p-2 text-left text-xs font-bold transition-colors disabled:opacity-40 ${on ? "border-pink bg-pink/10" : "border-border hover:border-pink"}`}>
              {seed.coverImage ? /* eslint-disable-next-line @next/next/no-img-element */
                <img src={seed.coverImage} alt="" className="h-16 w-11 shrink-0 rounded object-cover" /> : <span aria-hidden="true" className="stripe-fill h-16 w-11 shrink-0 rounded" />}
              <span className="line-clamp-3">{seed.title}</span>{on && <span aria-hidden="true" className="ml-auto text-pink">✓</span>}
            </button>;
          })}
        </div>}
      <div className="mt-6 flex flex-wrap items-center gap-4">
        <button type="button" disabled={selected.length !== 3} onClick={() => { updateDiscoveryPreferences({ seeds: selected }); onClose(); }} className="rounded-full bg-pink px-5 py-3 text-sm font-extrabold text-on-accent disabled:opacity-40">Use these 3 favorites</button>
        <button type="button" onClick={onClose} className="text-sm text-muted-foreground underline underline-offset-4">Maybe later</button>
        {initial.length > 0 && <button type="button" onClick={() => { updateDiscoveryPreferences({ seeds: [] }); onClose(); }} className="text-sm text-muted-foreground underline underline-offset-4">Clear favorites</button>}
      </div>
    </section>
  );
}
