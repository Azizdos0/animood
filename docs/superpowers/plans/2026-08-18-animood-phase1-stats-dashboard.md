# Animood Phase 1 — Stats Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Animood stats dashboard — a visual breakdown of the user's watching/reading habits computed from their list, including a "taste profile" view that visualizes the same tag affinities the recommender uses.

**Architecture:** The stat math lives in **pure, unit-tested functions** under `src/lib/stats/*` (no I/O), operating on `StatEntry[]` (a list entry zipped with its AniList `Media`). A client `StatsView` fetches media metadata for the user's list ids via the existing `/api/media` route, zips it with the reactive list store, computes every stat, and renders dependency-free CSS/SVG charts styled in the "Modern Dark / Cinema" design system. The taste-profile chart reuses `buildTasteProfile` from `src/lib/recommend`.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript strict, Tailwind v4, Vitest. No charting library — charts are hand-rolled CSS/SVG components.

## Global Constraints

- TypeScript strict; no accounts, no server DB, no social features.
- Stat functions in `src/lib/stats/*` MUST be pure/deterministic (no fetch/localStorage/Date).
- User score scale is 1–10.
- AniList data-fetching stays client-side via the existing `/api/media` route; never in the pure modules.
- Tests never hit the real AniList network.
- Import alias `@/` → `src/`. Reuse the design-system utility classes (`bg-surface`, `text-muted-foreground`, `from-primary to-accent`, `font-display`, etc.).

## Existing interfaces this plan consumes (already merged)

- `src/lib/anilist/types.ts`: `Media`, `MediaTag`, `MediaType`, `MediaFormat`.
- `src/lib/list/schema.ts`: `ListStatus`, `LIST_STATUSES`, `ListEntry`, `ListStoreV1`.
- `src/lib/list/reactive.ts`: `useListStore()`.
- `src/lib/list/labels.ts`: `STATUS_LABELS`, `STATUS_ACCENTS`.
- `src/lib/recommend/profile.ts`: `buildTasteProfile(titles: RatedTitle[])`; `src/lib/recommend/types.ts`: `RatedTitle`, `TasteProfile`, `TagAffinity`.
- `/api/media?ids=` → `{ items: (subset of Media) }` — note it returns full `Media` objects.
- `src/components/MediaCard.tsx`: `MediaCardData`.

---

### Task 1: Stats types, distributions & totals

**Files:**
- Create: `src/lib/stats/types.ts`
- Create: `src/lib/stats/constants.ts`
- Create: `src/lib/stats/compute.ts`
- Test: `src/lib/stats/__tests__/compute.test.ts`

**Interfaces:**
- Consumes: `Media` (anilist types); `ListEntry`, `ListStatus`, `LIST_STATUSES`.
- Produces:
  - `interface StatEntry { media: Media; entry: ListEntry }`
  - `constants.ts`: `ANIME_MINUTES_PER_EP = 24`.
  - `interface Totals { titles: number; anime: number; manga: number; episodes: number; minutes: number; chapters: number; completionRate: number; meanScore: number | null }`
  - `function scoreDistribution(entries: StatEntry[]): { score: number; count: number }[]` — buckets scored entries into scores 1..10 (always returns all 10 buckets in order).
  - `function statusBreakdown(entries: StatEntry[]): { status: ListStatus; count: number }[]` — count per status, in `LIST_STATUSES` order.
  - `function computeTotals(entries: StatEntry[]): Totals` — episodes watched (completed → `media.episodes ?? progress`; else `progress`) × `ANIME_MINUTES_PER_EP` for anime → minutes; chapters read likewise for manga; completionRate = completed/titles (0 when empty); meanScore = mean of non-null scores or null.

- [ ] **Step 1: Write the failing test at `src/lib/stats/__tests__/compute.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { scoreDistribution, statusBreakdown, computeTotals } from "@/lib/stats/compute";
import type { StatEntry } from "@/lib/stats/types";
import type { Media, MediaType } from "@/lib/anilist/types";
import type { ListEntry, ListStatus } from "@/lib/list/schema";

function media(id: number, type: MediaType, episodes: number | null, chapters: number | null = null): Media {
  return {
    id, type, title: `T${id}`, coverImage: null, bannerImage: null, description: null,
    genres: [], tags: [], format: type === "ANIME" ? "TV" : "MANGA", episodes, chapters,
    averageScore: 70, popularity: 1000, seasonYear: 2020, relations: [],
  };
}
function entry(status: ListStatus, score: number | null, progress: number): ListEntry {
  return { status, score, progress, updatedAt: "2026-01-01T00:00:00.000Z" };
}
const se = (m: Media, e: ListEntry): StatEntry => ({ media: m, entry: e });

describe("scoreDistribution", () => {
  it("returns all 10 buckets and counts scored entries", () => {
    const dist = scoreDistribution([
      se(media(1, "ANIME", 12), entry("completed", 9, 12)),
      se(media(2, "ANIME", 12), entry("completed", 9, 12)),
      se(media(3, "ANIME", 12), entry("watching", null, 3)),
    ]);
    expect(dist).toHaveLength(10);
    expect(dist[8]).toEqual({ score: 9, count: 2 });
    expect(dist[0]).toEqual({ score: 1, count: 0 });
  });
});

describe("statusBreakdown", () => {
  it("counts per status in canonical order", () => {
    const b = statusBreakdown([
      se(media(1, "ANIME", 12), entry("watching", null, 1)),
      se(media(2, "ANIME", 12), entry("completed", 8, 12)),
      se(media(3, "ANIME", 12), entry("completed", 7, 12)),
    ]);
    expect(b[0]).toEqual({ status: "watching", count: 1 });
    expect(b[1]).toEqual({ status: "completed", count: 2 });
  });
});

describe("computeTotals", () => {
  it("computes episodes, minutes, completion and mean score", () => {
    const t = computeTotals([
      se(media(1, "ANIME", 24), entry("completed", 10, 0)), // completed -> 24 eps
      se(media(2, "ANIME", 24), entry("watching", 8, 6)),   // watching -> 6 eps
      se(media(3, "MANGA", null, 100), entry("completed", 6, 50)), // completed manga
    ]);
    expect(t.titles).toBe(3);
    expect(t.anime).toBe(2);
    expect(t.manga).toBe(1);
    expect(t.episodes).toBe(30);       // 24 (completed) + 6 (watching progress)
    expect(t.minutes).toBe(30 * 24);
    expect(t.chapters).toBe(100);      // completed manga -> media.chapters (100), not progress
    expect(t.completionRate).toBeCloseTo(2 / 3);
    expect(t.meanScore).toBeCloseTo((10 + 8 + 6) / 3);
  });

  it("handles an empty list", () => {
    const t = computeTotals([]);
    expect(t.titles).toBe(0);
    expect(t.completionRate).toBe(0);
    expect(t.meanScore).toBeNull();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- compute`
Expected: FAIL — cannot find module `@/lib/stats/compute`.

- [ ] **Step 3: Implement `src/lib/stats/types.ts`**

```ts
import type { Media } from "@/lib/anilist/types";
import type { ListEntry } from "@/lib/list/schema";

export interface StatEntry {
  media: Media;
  entry: ListEntry;
}
```

- [ ] **Step 4: Implement `src/lib/stats/constants.ts`**

```ts
export const ANIME_MINUTES_PER_EP = 24;
```

- [ ] **Step 5: Implement `src/lib/stats/compute.ts`**

```ts
import type { MediaType } from "@/lib/anilist/types";
import { LIST_STATUSES, type ListStatus } from "@/lib/list/schema";
import { ANIME_MINUTES_PER_EP } from "./constants";
import type { StatEntry } from "./types";

export interface Totals {
  titles: number;
  anime: number;
  manga: number;
  episodes: number;
  minutes: number;
  chapters: number;
  completionRate: number;
  meanScore: number | null;
}

function unitsConsumed(e: StatEntry, type: MediaType): number {
  const total = type === "ANIME" ? e.media.episodes : e.media.chapters;
  if (e.entry.status === "completed") return total ?? e.entry.progress;
  return e.entry.progress;
}

export function scoreDistribution(entries: StatEntry[]): { score: number; count: number }[] {
  const buckets = Array.from({ length: 10 }, (_, i) => ({ score: i + 1, count: 0 }));
  for (const e of entries) {
    if (e.entry.score !== null && e.entry.score >= 1 && e.entry.score <= 10) {
      buckets[e.entry.score - 1].count += 1;
    }
  }
  return buckets;
}

export function statusBreakdown(entries: StatEntry[]): { status: ListStatus; count: number }[] {
  return LIST_STATUSES.map((status) => ({
    status,
    count: entries.filter((e) => e.entry.status === status).length,
  }));
}

export function computeTotals(entries: StatEntry[]): Totals {
  let anime = 0, manga = 0, episodes = 0, chapters = 0, completed = 0;
  let scoreSum = 0, scoreCount = 0;

  for (const e of entries) {
    if (e.media.type === "ANIME") {
      anime += 1;
      episodes += unitsConsumed(e, "ANIME");
    } else {
      manga += 1;
      chapters += unitsConsumed(e, "MANGA");
    }
    if (e.entry.status === "completed") completed += 1;
    if (e.entry.score !== null) {
      scoreSum += e.entry.score;
      scoreCount += 1;
    }
  }

  const titles = entries.length;
  return {
    titles, anime, manga, episodes,
    minutes: episodes * ANIME_MINUTES_PER_EP,
    chapters,
    completionRate: titles > 0 ? completed / titles : 0,
    meanScore: scoreCount > 0 ? scoreSum / scoreCount : null,
  };
}
```

- [ ] **Step 6: Run it to verify it passes**

Run: `npm test -- compute`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/stats/types.ts src/lib/stats/constants.ts src/lib/stats/compute.ts src/lib/stats/__tests__/compute.test.ts
git commit -m "feat: add stats distributions and totals"
```

---

### Task 2: Breakdowns (genre, tag, format) & taste-affinity summary

**Files:**
- Create: `src/lib/stats/breakdowns.ts`
- Test: `src/lib/stats/__tests__/breakdowns.test.ts`

**Interfaces:**
- Consumes: `StatEntry`; `Media`, `MediaFormat`; `buildTasteProfile`, `RatedTitle`, `TasteProfile`, `TagAffinity`.
- Produces:
  - `interface Count { name: string; count: number }`
  - `function genreBreakdown(entries: StatEntry[]): Count[]` — count of each genre across all entries' media, sorted count desc then name asc.
  - `function topTags(entries: StatEntry[], n?: number): Count[]` — top `n` (default 12) tags by frequency (weighted by tag rank ≥ 60 counts as present), sorted desc.
  - `function formatBreakdown(entries: StatEntry[]): Count[]` — count per `media.format`, sorted desc.
  - `function tasteAffinitySummary(entries: StatEntry[], n?: number): { positive: TagAffinity[]; negative: TagAffinity[] }` — builds a `TasteProfile` via `buildTasteProfile` (mapping each `StatEntry` to a `RatedTitle`), returns top `n` (default 8) tags by affinity descending (positive) and ascending (negative), excluding ~zero affinities.

- [ ] **Step 1: Write the failing test at `src/lib/stats/__tests__/breakdowns.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { genreBreakdown, topTags, formatBreakdown, tasteAffinitySummary } from "@/lib/stats/breakdowns";
import type { StatEntry } from "@/lib/stats/types";
import type { Media, MediaType, MediaTag } from "@/lib/anilist/types";
import type { ListEntry, ListStatus } from "@/lib/list/schema";

function media(id: number, opts: Partial<Media> = {}): Media {
  return {
    id, type: "ANIME" as MediaType, title: `T${id}`, coverImage: null, bannerImage: null,
    description: null, genres: [], tags: [], format: "TV", episodes: 12, chapters: null,
    averageScore: 70, popularity: 1000, seasonYear: 2020, relations: [], ...opts,
  };
}
const e = (status: ListStatus, score: number | null): ListEntry => ({ status, score, progress: 0, updatedAt: "" });
const se = (m: Media, en: ListEntry): StatEntry => ({ media: m, entry: en });

describe("genreBreakdown", () => {
  it("counts and sorts genres", () => {
    const out = genreBreakdown([
      se(media(1, { genres: ["Action", "Comedy"] }), e("completed", 8)),
      se(media(2, { genres: ["Action"] }), e("completed", 7)),
    ]);
    expect(out[0]).toEqual({ name: "Action", count: 2 });
    expect(out[1]).toEqual({ name: "Comedy", count: 1 });
  });
});

describe("formatBreakdown", () => {
  it("counts formats", () => {
    const out = formatBreakdown([
      se(media(1, { format: "TV" }), e("completed", 8)),
      se(media(2, { format: "MOVIE" }), e("completed", 8)),
      se(media(3, { format: "TV" }), e("completed", 8)),
    ]);
    expect(out[0]).toEqual({ name: "TV", count: 2 });
  });
});

describe("topTags", () => {
  it("counts tags at or above the rank threshold", () => {
    const tag = (id: number, name: string, rank: number): MediaTag => ({ id, name, rank });
    const out = topTags([
      se(media(1, { tags: [tag(1, "Time Loop", 90), tag(2, "Weak", 20)] }), e("completed", 9)),
      se(media(2, { tags: [tag(1, "Time Loop", 80)] }), e("completed", 9)),
    ]);
    expect(out[0]).toEqual({ name: "Time Loop", count: 2 });
    expect(out.find((t) => t.name === "Weak")).toBeUndefined();
  });
});

describe("tasteAffinitySummary", () => {
  it("splits positive and negative affinities", () => {
    const tag = (id: number, name: string, rank: number): MediaTag => ({ id, name, rank });
    const { positive, negative } = tasteAffinitySummary([
      se(media(1, { tags: [tag(10, "Loved", 100)] }), e("completed", 10)),
      se(media(2, { tags: [tag(20, "Hated", 100)] }), e("completed", 4)),
    ]);
    expect(positive[0].name).toBe("Loved");
    expect(negative[0].name).toBe("Hated");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- breakdowns`
Expected: FAIL — cannot find module `@/lib/stats/breakdowns`.

- [ ] **Step 3: Implement `src/lib/stats/breakdowns.ts`**

```ts
import { buildTasteProfile } from "@/lib/recommend/profile";
import type { RatedTitle, TagAffinity } from "@/lib/recommend/types";
import type { StatEntry } from "./types";

export interface Count {
  name: string;
  count: number;
}

const TAG_PRESENT_RANK = 60;

function tally(names: string[]): Count[] {
  const map = new Map<string, number>();
  for (const n of names) map.set(n, (map.get(n) ?? 0) + 1);
  return [...map.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

export function genreBreakdown(entries: StatEntry[]): Count[] {
  return tally(entries.flatMap((e) => e.media.genres));
}

export function formatBreakdown(entries: StatEntry[]): Count[] {
  return tally(
    entries.map((e) => e.media.format).filter((f): f is NonNullable<typeof f> => f !== null)
  );
}

export function topTags(entries: StatEntry[], n = 12): Count[] {
  const names = entries.flatMap((e) =>
    e.media.tags.filter((t) => t.rank >= TAG_PRESENT_RANK).map((t) => t.name)
  );
  return tally(names).slice(0, n);
}

export function tasteAffinitySummary(
  entries: StatEntry[],
  n = 8
): { positive: TagAffinity[]; negative: TagAffinity[] } {
  const rated: RatedTitle[] = entries.map((e) => ({
    media: e.media, score: e.entry.score, status: e.entry.status,
  }));
  const profile = buildTasteProfile(rated);
  const all = Object.values(profile.tags).filter((t) => Math.abs(t.affinity) > 0.001);
  const positive = [...all].filter((t) => t.affinity > 0).sort((a, b) => b.affinity - a.affinity).slice(0, n);
  const negative = [...all].filter((t) => t.affinity < 0).sort((a, b) => a.affinity - b.affinity).slice(0, n);
  return { positive, negative };
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npm test -- breakdowns`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/stats/breakdowns.ts src/lib/stats/__tests__/breakdowns.test.ts
git commit -m "feat: add stats breakdowns and taste-affinity summary"
```

---

### Task 3: Chart components

**Files:**
- Create: `src/components/stats/StatTile.tsx`
- Create: `src/components/stats/BarList.tsx`
- Create: `src/components/stats/ScoreHistogram.tsx`
- Create: `src/components/stats/AffinityBars.tsx`
- Test: `src/components/stats/__tests__/charts.test.tsx`

**Interfaces:**
- Consumes: design-system classes; `Count` type shape (`{ name; count }`); `TagAffinity`.
- Produces (all presentational, no data fetching):
  - `function StatTile({ label, value, sub }: { label: string; value: string; sub?: string }): JSX.Element`
  - `function BarList({ items, accent }: { items: { name: string; count: number }[]; accent?: string }): JSX.Element` — horizontal bars scaled to the max count; empty state when no items.
  - `function ScoreHistogram({ data }: { data: { score: number; count: number }[] }): JSX.Element` — 10 vertical bars.
  - `function AffinityBars({ positive, negative }: { positive: { name: string; affinity: number }[]; negative: { name: string; affinity: number }[] }): JSX.Element` — diverging bars (positive → accent, negative → destructive).

- [ ] **Step 1: Write the failing test at `src/components/stats/__tests__/charts.test.tsx`**

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { StatTile } from "@/components/stats/StatTile";
import { BarList } from "@/components/stats/BarList";
import { ScoreHistogram } from "@/components/stats/ScoreHistogram";
import { AffinityBars } from "@/components/stats/AffinityBars";

describe("stat charts", () => {
  it("StatTile shows label and value", () => {
    render(<StatTile label="Episodes" value="1,234" sub="watched" />);
    expect(screen.getByText("Episodes")).toBeInTheDocument();
    expect(screen.getByText("1,234")).toBeInTheDocument();
  });

  it("BarList renders a row per item and an empty state", () => {
    const { rerender } = render(<BarList items={[{ name: "Action", count: 5 }, { name: "Comedy", count: 2 }]} />);
    expect(screen.getByText("Action")).toBeInTheDocument();
    expect(screen.getByText("Comedy")).toBeInTheDocument();
    rerender(<BarList items={[]} />);
    expect(screen.getByText(/no data/i)).toBeInTheDocument();
  });

  it("ScoreHistogram renders all 10 score labels", () => {
    render(<ScoreHistogram data={Array.from({ length: 10 }, (_, i) => ({ score: i + 1, count: i }))} />);
    expect(screen.getByText("10")).toBeInTheDocument();
    expect(screen.getByText("1")).toBeInTheDocument();
  });

  it("AffinityBars shows positive and negative tag names", () => {
    render(<AffinityBars positive={[{ name: "Time Loop", affinity: 2 }]} negative={[{ name: "Ecchi", affinity: -1 }]} />);
    expect(screen.getByText("Time Loop")).toBeInTheDocument();
    expect(screen.getByText("Ecchi")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- charts`
Expected: FAIL — cannot find modules.

- [ ] **Step 3: Implement `src/components/stats/StatTile.tsx`**

```tsx
export function StatTile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-2xl border border-border bg-surface/60 p-5">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-2 font-display text-3xl font-extrabold tracking-tight">{value}</p>
      {sub ? <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p> : null}
    </div>
  );
}
```

- [ ] **Step 4: Implement `src/components/stats/BarList.tsx`**

```tsx
export function BarList({
  items,
  accent = "var(--color-primary)",
}: {
  items: { name: string; count: number }[];
  accent?: string;
}) {
  if (items.length === 0) {
    return <p className="py-6 text-center text-sm text-muted-foreground">No data yet.</p>;
  }
  const max = Math.max(...items.map((i) => i.count), 1);
  return (
    <ul className="space-y-2">
      {items.map((i) => (
        <li key={i.name} className="flex items-center gap-3">
          <span className="w-28 shrink-0 truncate text-xs text-muted-foreground" title={i.name}>
            {i.name}
          </span>
          <span className="relative h-4 flex-1 overflow-hidden rounded-full bg-background">
            <span
              className="absolute inset-y-0 left-0 rounded-full"
              style={{ width: `${(i.count / max) * 100}%`, backgroundColor: accent }}
            />
          </span>
          <span className="w-8 shrink-0 text-right text-xs font-medium tabular-nums">{i.count}</span>
        </li>
      ))}
    </ul>
  );
}
```

- [ ] **Step 5: Implement `src/components/stats/ScoreHistogram.tsx`**

```tsx
export function ScoreHistogram({ data }: { data: { score: number; count: number }[] }) {
  const max = Math.max(...data.map((d) => d.count), 1);
  return (
    <div className="flex items-end justify-between gap-1.5" style={{ height: 160 }}>
      {data.map((d) => (
        <div key={d.score} className="flex flex-1 flex-col items-center gap-1.5">
          <div className="flex w-full flex-1 items-end">
            <div
              className="w-full rounded-t bg-gradient-to-t from-primary-strong to-accent"
              style={{ height: `${(d.count / max) * 100}%`, minHeight: d.count > 0 ? 4 : 0 }}
              title={`${d.count}`}
            />
          </div>
          <span className="text-[11px] text-muted-foreground tabular-nums">{d.score}</span>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 6: Implement `src/components/stats/AffinityBars.tsx`**

```tsx
export function AffinityBars({
  positive,
  negative,
}: {
  positive: { name: string; affinity: number }[];
  negative: { name: string; affinity: number }[];
}) {
  const max = Math.max(1, ...positive.map((t) => t.affinity), ...negative.map((t) => Math.abs(t.affinity)));
  const Row = ({ name, affinity, color }: { name: string; affinity: number; color: string }) => (
    <li className="flex items-center gap-3">
      <span className="w-28 shrink-0 truncate text-xs text-muted-foreground" title={name}>{name}</span>
      <span className="relative h-3 flex-1 overflow-hidden rounded-full bg-background">
        <span
          className="absolute inset-y-0 left-0 rounded-full"
          style={{ width: `${(Math.abs(affinity) / max) * 100}%`, backgroundColor: color }}
        />
      </span>
    </li>
  );
  return (
    <div className="grid gap-6 sm:grid-cols-2">
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-accent">You love</p>
        {positive.length === 0 ? (
          <p className="text-sm text-muted-foreground">Not enough data yet.</p>
        ) : (
          <ul className="space-y-2">
            {positive.map((t) => <Row key={t.name} name={t.name} affinity={t.affinity} color="var(--color-accent)" />)}
          </ul>
        )}
      </div>
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-destructive">Not your thing</p>
        {negative.length === 0 ? (
          <p className="text-sm text-muted-foreground">Not enough data yet.</p>
        ) : (
          <ul className="space-y-2">
            {negative.map((t) => <Row key={t.name} name={t.name} affinity={t.affinity} color="var(--color-destructive)" />)}
          </ul>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 7: Run it to verify it passes**

Run: `npm test -- charts`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/components/stats/ src/components/stats/__tests__/charts.test.tsx
git commit -m "feat: add stats chart components"
```

---

### Task 4: Stats dashboard page & view

**Files:**
- Create: `src/lib/stats/format.ts` (pure display helpers)
- Create: `src/components/StatsView.tsx` (Client Component)
- Create: `src/app/stats/page.tsx`
- Modify: `src/components/Navbar.tsx` (add "Stats" link)
- Test: `src/lib/stats/__tests__/format.test.ts`

**Interfaces:**
- Consumes: `useListStore`; `/api/media`; all `src/lib/stats/*` compute fns + chart components; `Media`, `ListEntry`.
- Produces:
  - `function formatMinutes(minutes: number): string` — e.g. `1500 → "1d 1h"` (days/hours/minutes, omitting zero units; `0 → "0m"`).
  - `function formatNumber(n: number): string` — thousands separators.
  - `StatsView` — reads the list from `useListStore`; if empty → cold-start prompt; else fetches media via `/api/media?ids=`, zips into `StatEntry[]`, computes all stats, and renders: a `StatTile` row (titles, episodes, time watched, mean score, completion %), a `ScoreHistogram`, a `BarList` for genres / top tags / formats / statuses, and an `AffinityBars` taste-profile section. Handles loading / error (502) states like the rest of the app.
  - Stats `page.tsx` renders `<StatsView />` under a section heading.

- [ ] **Step 1: Write the failing test at `src/lib/stats/__tests__/format.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { formatMinutes, formatNumber } from "@/lib/stats/format";

describe("formatMinutes", () => {
  it("formats days, hours and minutes, omitting zero units", () => {
    expect(formatMinutes(0)).toBe("0m");
    expect(formatMinutes(45)).toBe("45m");
    expect(formatMinutes(90)).toBe("1h 30m");
    expect(formatMinutes(1500)).toBe("1d 1h");   // 1500 = 25h = 1d 1h 0m -> "1d 1h"
  });
});

describe("formatNumber", () => {
  it("adds thousands separators", () => {
    expect(formatNumber(1234567)).toBe("1,234,567");
    expect(formatNumber(42)).toBe("42");
  });
});
```

Note: `formatMinutes(1500)` — when days>0, show days+hours only (drop minutes) for brevity; when <1 day, show hours+minutes; when <1 hour, show minutes. Implement to satisfy these exact cases.

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- format`
Expected: FAIL — cannot find module `@/lib/stats/format`.

- [ ] **Step 3: Implement `src/lib/stats/format.ts`**

```ts
export function formatNumber(n: number): string {
  return n.toLocaleString("en-US");
}

export function formatMinutes(minutes: number): string {
  if (minutes <= 0) return "0m";
  const days = Math.floor(minutes / (60 * 24));
  const hours = Math.floor((minutes % (60 * 24)) / 60);
  const mins = Math.floor(minutes % 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npm test -- format`
Expected: PASS.

- [ ] **Step 5: Implement `src/components/StatsView.tsx`**

```tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useListStore } from "@/lib/list/reactive";
import type { Media } from "@/lib/anilist/types";
import type { StatEntry } from "@/lib/stats/types";
import { scoreDistribution, statusBreakdown, computeTotals } from "@/lib/stats/compute";
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

  const entries: StatEntry[] = ids
    .filter((id) => media[id])
    .map((id) => ({ media: media[id], entry: store.entries[id] }));

  const totals = computeTotals(entries);
  const dist = scoreDistribution(entries);
  const genres = genreBreakdown(entries).slice(0, 10);
  const tags = topTags(entries, 10);
  const formats = formatBreakdown(entries);
  const statuses = statusBreakdown(entries)
    .filter((s) => s.count > 0)
    .map((s) => ({ name: STATUS_LABELS[s.status], count: s.count }));
  const affinity = tasteAffinitySummary(entries);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        <StatTile label="Titles" value={formatNumber(totals.titles)} sub={`${totals.anime} anime · ${totals.manga} manga`} />
        <StatTile label="Episodes" value={formatNumber(totals.episodes)} sub="watched" />
        <StatTile label="Time" value={formatMinutes(totals.minutes)} sub="of anime" />
        <StatTile label="Mean score" value={totals.meanScore ? totals.meanScore.toFixed(1) : "—"} sub="your average" />
        <StatTile label="Completion" value={`${Math.round(totals.completionRate * 100)}%`} sub="of your list" />
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
```

- [ ] **Step 6: Implement `src/app/stats/page.tsx`**

```tsx
import { StatsView } from "@/components/StatsView";

export default function StatsPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <span className="h-6 w-1.5 rounded-full bg-gradient-to-b from-primary to-accent" />
        <h1 className="font-display text-2xl font-bold tracking-tight">Stats</h1>
      </div>
      <StatsView />
    </div>
  );
}
```

- [ ] **Step 7: Add the "Stats" link to `src/components/Navbar.tsx`**

Add after the "My List" link, mirroring its styling:

```tsx
<Link
  href="/stats"
  className="rounded-full px-3 py-1.5 text-muted-foreground transition-colors hover:bg-surface-hover hover:text-foreground"
>
  Stats
</Link>
```

- [ ] **Step 8: Run tests, typecheck, and build**

Run: `npm test`
Expected: all PASS.

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `npm run build`
Expected: build succeeds; `/stats` compiles.

- [ ] **Step 9: Commit**

```bash
git add src/lib/stats/format.ts src/components/StatsView.tsx src/app/stats/page.tsx src/components/Navbar.tsx src/lib/stats/__tests__/format.test.ts
git commit -m "feat: add stats dashboard page"
```

---

## Self-Review Notes

- **Spec coverage (stats slice, §6):** score distribution → Task 1 + Task 3 histogram. Genre/tag breakdown → Task 2 + Task 3 BarList. Format split → Task 2. Total episodes & estimated time → Task 1 (`computeTotals`) + Task 4 `formatMinutes`. Completion rate → Task 1. Status breakdown → Task 1. Taste-profile view (reusing the recommender's affinities) → Task 2 `tasteAffinitySummary` + Task 3 `AffinityBars`. "Activity over time" from the spec is intentionally deferred (see below).
- **Purity:** all `src/lib/stats/*` functions are pure and unit-tested; only `StatsView` does I/O (via the existing `/api/media`).
- **Reuse:** the taste-profile chart reuses `buildTasteProfile` from `src/lib/recommend`, so stats and recommendations share one taste model (spec §6 "stats and recs reinforce each other").
- **Type consistency:** `StatEntry` (Task 1) reused everywhere; `Count` (Task 2) consumed by `BarList` (Task 3) and `StatsView` (Task 4); `Totals` (Task 1) consumed by Task 4.
- **Deferred:** "activity over time" (needs richer per-entry history than a single `updatedAt`); a genuinely accurate watch-time (AniList per-title episode duration isn't fetched — we approximate 24 min/ep and label the tile "of anime"). Both are honest Phase-2 refinements, not Phase-1 blockers.
