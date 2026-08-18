# Animood Phase 1 — Recommendation Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build Animood's explainable hybrid recommendation engine — a taste-profile ranker over the user's list blended with AniList community recommendations — and surface it on a recommendations page with a diversity dial, "why" explanations, exclusion filters, and cold-start handling.

**Architecture:** The ranking math lives in **pure, unit-tested functions** under `src/lib/recommend/*` (no I/O). A `/api/recommendations` route handler does the AniList data-gathering (server-side, cached): it fetches the user's rated media, aggregates community recommendations to generate candidates, scores each candidate against the taste profile, and returns `{ profile, pool }`. The client `RecommendationsView` then applies **MMR diversity re-ranking + exclusion filters instantly** as the user moves the dial — pure functions run in the browser on the already-scored pool, so no round-trip per tweak.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript strict, Tailwind v4 (existing "Modern Dark / Cinema" design system), Vitest.

## Global Constraints

- TypeScript strict; no accounts, no server DB, no social features.
- The user's list is the only personal input; it is read client-side (reactive store) and POSTed to `/api/recommendations`. No persistence server-side.
- User score scale is 1–10 (`score: number | null`).
- Ranking functions in `src/lib/recommend/*` MUST be pure (no fetch, no localStorage, no Date.now in scoring) so they are deterministic and unit-testable.
- AniList data-fetching stays in Server Components / route handlers; never in the pure modules.
- Tests never hit the real AniList network — mock `fetch` or the data functions.
- Import alias `@/` → `src/`. Reuse the existing design-system utility classes (`bg-surface`, `text-muted-foreground`, `from-primary-strong to-accent`, `stagger`, `reveal`, etc.).

## Existing interfaces this plan consumes (already merged)

- `src/lib/anilist/media.ts`: `getMediaByIds(ids)`, `getRecommendationsFor(mediaId, perPage?)`, `getTrending(type, perPage?)`.
- `src/lib/anilist/types.ts`: `Media`, `MediaTag` (`{ id, name, rank }`, rank 0–100), `MediaStub`, `MediaRecommendation` (`{ mediaId, rating, media }`), `MediaType`, `MediaFormat`.
- `src/lib/anilist/relations.ts`: `relatedByType(media, relationType)`.
- `src/lib/list/schema.ts`: `ListStatus`, `LIST_STATUSES`, `ListEntry`, `ListStoreV1`.
- `src/lib/list/reactive.ts`: `useListStore()`.
- `src/components/MediaCard.tsx`: `MediaCard`, `MediaCardData`.
- `src/components/MediaRow.tsx`: `toCardData`.

---

### Task 1: Recommend types, constants & taste profile

**Files:**
- Create: `src/lib/recommend/types.ts`
- Create: `src/lib/recommend/constants.ts`
- Create: `src/lib/recommend/profile.ts`
- Test: `src/lib/recommend/__tests__/profile.test.ts`

**Interfaces:**
- Consumes: `Media`, `MediaTag` (anilist types); `ListStatus`.
- Produces:
  - `interface RatedTitle { media: Media; score: number | null; status: ListStatus }`
  - `interface TagAffinity { tagId: number; name: string; affinity: number; count: number }`
  - `interface TasteProfile { meanScore: number; ratedCount: number; tags: Record<number, TagAffinity> }`
  - `constants.ts` exports: `SHRINKAGE_K = 3`, `DROPPED_SIGNAL = -2`, `NEUTRAL_MEAN = 6`, `QUALITY_MIN_VOTES = 10000`, `QUALITY_GLOBAL_MEAN = 6.5`, `W_MATCH = 1`, `W_QUALITY = 0.35`, `W_COMMUNITY = 0.6`.
  - `function buildTasteProfile(titles: RatedTitle[]): TasteProfile` — centers scores around the user's mean of non-null scores (falls back to `NEUTRAL_MEAN` if fewer than 2 scored titles); computes per-tag affinity as the rank-weighted average of centered signals; dropped titles without a score contribute `DROPPED_SIGNAL`; applies count-based shrinkage `affinity *= count/(count+SHRINKAGE_K)`.

- [ ] **Step 1: Write the failing test at `src/lib/recommend/__tests__/profile.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { buildTasteProfile } from "@/lib/recommend/profile";
import type { RatedTitle } from "@/lib/recommend/types";
import type { Media, MediaTag } from "@/lib/anilist/types";

function media(id: number, tags: [number, string, number][]): Media {
  return {
    id, type: "ANIME", title: `T${id}`, coverImage: null, bannerImage: null,
    description: null, genres: [], format: "TV", episodes: 12, chapters: null,
    averageScore: 70, popularity: 1000, seasonYear: 2020, relations: [],
    tags: tags.map(([tid, name, rank]) => ({ id: tid, name, rank } as MediaTag)),
  };
}

describe("buildTasteProfile", () => {
  it("centers scores and gives loved tags positive affinity", () => {
    const titles: RatedTitle[] = [
      { media: media(1, [[10, "Time Loop", 100]]), score: 10, status: "completed" },
      { media: media(2, [[20, "Slice of Life", 100]]), score: 4, status: "completed" },
    ];
    const p = buildTasteProfile(titles);
    expect(p.meanScore).toBe(7); // (10+4)/2
    expect(p.tags[10].affinity).toBeGreaterThan(0); // loved
    expect(p.tags[20].affinity).toBeLessThan(0);    // disliked
  });

  it("weights a tag by its rank percentage", () => {
    const titles: RatedTitle[] = [
      { media: media(1, [[10, "Time Loop", 50]]), score: 10, status: "completed" },
      { media: media(2, [[10, "Time Loop", 50]]), score: 10, status: "completed" },
    ];
    const p = buildTasteProfile(titles);
    // both scored 10, mean 10 -> centered 0 -> affinity 0
    expect(p.tags[10].affinity).toBe(0);
  });

  it("applies shrinkage so a single-sample tag is pulled toward zero", () => {
    // Common (5x) and Rare (1x) share the SAME raw signal (all scored 10);
    // two low-scored filler titles pull the mean below 10 so the centered
    // signal is non-zero. Equal raw affinity, but the smaller-sample tag
    // shrinks harder toward zero.
    const common: RatedTitle[] = Array.from({ length: 5 }, (_, i) => ({
      media: media(i + 1, [[10, "Common", 100]]), score: 10, status: "completed" as const,
    }));
    const rare: RatedTitle = { media: media(50, [[20, "Rare", 100]]), score: 10, status: "completed" };
    const fillers: RatedTitle[] = Array.from({ length: 2 }, (_, i) => ({
      media: media(80 + i, [[30, "Filler", 100]]), score: 3, status: "completed" as const,
    }));
    const p = buildTasteProfile([...common, rare, ...fillers]);
    expect(p.tags[10].affinity).toBeGreaterThan(0);
    expect(p.tags[20].affinity).toBeGreaterThan(0);
    // same raw signal, but Rare (count 1) shrinks more than Common (count 5)
    expect(Math.abs(p.tags[20].affinity)).toBeLessThan(Math.abs(p.tags[10].affinity));
  });

  it("treats an unscored dropped title as a negative signal", () => {
    const titles: RatedTitle[] = [
      { media: media(1, [[30, "Isekai", 100]]), score: null, status: "dropped" },
      { media: media(2, [[40, "Drama", 100]]), score: 8, status: "completed" },
    ];
    const p = buildTasteProfile(titles);
    expect(p.tags[30].affinity).toBeLessThan(0);
  });

  it("uses the neutral mean fallback with fewer than 2 scored titles", () => {
    const p = buildTasteProfile([
      { media: media(1, [[10, "X", 100]]), score: null, status: "planning" },
    ]);
    expect(p.meanScore).toBe(6);
    expect(p.ratedCount).toBe(0);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- profile`
Expected: FAIL — cannot find module `@/lib/recommend/profile`.

- [ ] **Step 3: Implement `src/lib/recommend/types.ts`**

```ts
import type { Media } from "@/lib/anilist/types";
import type { ListStatus } from "@/lib/list/schema";

export interface RatedTitle {
  media: Media;
  score: number | null;
  status: ListStatus;
}

export interface TagAffinity {
  tagId: number;
  name: string;
  affinity: number;
  count: number;
}

export interface TasteProfile {
  meanScore: number;
  ratedCount: number;
  tags: Record<number, TagAffinity>;
}
```

- [ ] **Step 4: Implement `src/lib/recommend/constants.ts`**

```ts
export const SHRINKAGE_K = 3;
export const DROPPED_SIGNAL = -2;
export const NEUTRAL_MEAN = 6;

export const QUALITY_MIN_VOTES = 10000;
export const QUALITY_GLOBAL_MEAN = 6.5;

export const W_MATCH = 1;
export const W_QUALITY = 0.35;
export const W_COMMUNITY = 0.6;
```

- [ ] **Step 5: Implement `src/lib/recommend/profile.ts`**

```ts
import type { RatedTitle, TasteProfile, TagAffinity } from "./types";
import { DROPPED_SIGNAL, NEUTRAL_MEAN, SHRINKAGE_K } from "./constants";

export function buildTasteProfile(titles: RatedTitle[]): TasteProfile {
  const scored = titles.filter((t) => t.score !== null);
  const meanScore =
    scored.length >= 2
      ? scored.reduce((s, t) => s + (t.score as number), 0) / scored.length
      : NEUTRAL_MEAN;

  const acc = new Map<number, { name: string; weightedSum: number; weight: number; count: number }>();

  for (const t of titles) {
    let signal: number | null = null;
    if (t.score !== null) signal = t.score - meanScore;
    else if (t.status === "dropped") signal = DROPPED_SIGNAL;
    if (signal === null) continue;

    for (const tag of t.media.tags) {
      const w = tag.rank / 100;
      if (w <= 0) continue;
      const cur = acc.get(tag.id) ?? { name: tag.name, weightedSum: 0, weight: 0, count: 0 };
      cur.weightedSum += signal * w;
      cur.weight += w;
      cur.count += 1;
      acc.set(tag.id, cur);
    }
  }

  const tags: Record<number, TagAffinity> = {};
  for (const [tagId, v] of acc) {
    const raw = v.weight > 0 ? v.weightedSum / v.weight : 0;
    const shrunk = raw * (v.count / (v.count + SHRINKAGE_K));
    tags[tagId] = { tagId, name: v.name, affinity: shrunk, count: v.count };
  }

  return { meanScore, ratedCount: scored.length, tags };
}
```

- [ ] **Step 6: Run it to verify it passes**

Run: `npm test -- profile`
Expected: PASS, 5 tests.

- [ ] **Step 7: Commit**

```bash
git add src/lib/recommend/types.ts src/lib/recommend/constants.ts src/lib/recommend/profile.ts src/lib/recommend/__tests__/profile.test.ts
git commit -m "feat: add taste-profile builder for recommendations"
```

---

### Task 2: Candidate scoring (tag-match, Bayesian quality, community boost)

**Files:**
- Create: `src/lib/recommend/scoring.ts`
- Test: `src/lib/recommend/__tests__/scoring.test.ts`

**Interfaces:**
- Consumes: `Media`; `TasteProfile` (types.ts); constants.
- Produces:
  - `interface TagContribution { tagId: number; name: string; value: number }`
  - `interface ScoredCandidate { media: Media; base: number; tagMatch: number; qualityPrior: number; communityBoost: number; contributions: TagContribution[] }`
  - `function bayesianRating(averageScore: number | null, popularity: number): number` — IMDB-style weighted rating on a 0–10 scale using `QUALITY_MIN_VOTES` and `QUALITY_GLOBAL_MEAN`; `averageScore` is AniList 0–100 (converted to 0–10); null → `QUALITY_GLOBAL_MEAN`.
  - `function tagMatch(media: Media, profile: TasteProfile): { value: number; contributions: TagContribution[] }` — Σ over the candidate's tags present in the profile of `affinity × rank/100`; contributions sorted by absolute value descending.
  - `function scoreCandidate(media: Media, profile: TasteProfile, communityBoost: number): ScoredCandidate` — `base = W_MATCH*tagMatch + W_QUALITY*qualityPrior + W_COMMUNITY*communityBoost`.

- [ ] **Step 1: Write the failing test at `src/lib/recommend/__tests__/scoring.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { bayesianRating, tagMatch, scoreCandidate } from "@/lib/recommend/scoring";
import type { TasteProfile } from "@/lib/recommend/types";
import type { Media, MediaTag } from "@/lib/anilist/types";

function media(id: number, avg: number | null, pop: number, tags: [number, string, number][]): Media {
  return {
    id, type: "ANIME", title: `T${id}`, coverImage: null, bannerImage: null,
    description: null, genres: [], format: "TV", episodes: 12, chapters: null,
    averageScore: avg, popularity: pop, seasonYear: 2020, relations: [],
    tags: tags.map(([tid, name, rank]) => ({ id: tid, name, rank } as MediaTag)),
  };
}

const profile: TasteProfile = {
  meanScore: 7, ratedCount: 5,
  tags: {
    10: { tagId: 10, name: "Time Loop", affinity: 2, count: 4 },
    20: { tagId: 20, name: "Slice of Life", affinity: -1.5, count: 3 },
  },
};

describe("bayesianRating", () => {
  it("pulls low-vote titles toward the global mean", () => {
    const lowVotes = bayesianRating(100, 1); // avg 10 but ~no votes
    const manyVotes = bayesianRating(100, 1_000_000);
    expect(manyVotes).toBeGreaterThan(lowVotes);
    expect(lowVotes).toBeLessThan(10);
  });

  it("returns the global mean when averageScore is null", () => {
    expect(bayesianRating(null, 5000)).toBe(6.5);
  });
});

describe("tagMatch", () => {
  it("rewards aligned tags and penalizes disliked ones", () => {
    const aligned = tagMatch(media(1, 70, 1000, [[10, "Time Loop", 100]]), profile);
    const disliked = tagMatch(media(2, 70, 1000, [[20, "Slice of Life", 100]]), profile);
    expect(aligned.value).toBeGreaterThan(0);
    expect(disliked.value).toBeLessThan(0);
    expect(aligned.contributions[0].tagId).toBe(10);
  });

  it("ignores tags not in the profile", () => {
    const m = tagMatch(media(3, 70, 1000, [[999, "Unknown", 100]]), profile);
    expect(m.value).toBe(0);
    expect(m.contributions).toHaveLength(0);
  });
});

describe("scoreCandidate", () => {
  it("combines match, quality and community into a base score", () => {
    const s = scoreCandidate(media(1, 80, 50000, [[10, "Time Loop", 100]]), profile, 1);
    expect(s.tagMatch).toBeGreaterThan(0);
    expect(s.qualityPrior).toBeGreaterThan(0);
    expect(s.communityBoost).toBe(1);
    expect(s.base).toBeGreaterThan(s.tagMatch); // quality + community add on top
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- scoring`
Expected: FAIL — cannot find module `@/lib/recommend/scoring`.

- [ ] **Step 3: Implement `src/lib/recommend/scoring.ts`**

```ts
import type { Media } from "@/lib/anilist/types";
import type { TasteProfile } from "./types";
import {
  QUALITY_GLOBAL_MEAN, QUALITY_MIN_VOTES, W_COMMUNITY, W_MATCH, W_QUALITY,
} from "./constants";

export interface TagContribution {
  tagId: number;
  name: string;
  value: number;
}

export interface ScoredCandidate {
  media: Media;
  base: number;
  tagMatch: number;
  qualityPrior: number;
  communityBoost: number;
  contributions: TagContribution[];
}

export function bayesianRating(averageScore: number | null, popularity: number): number {
  if (averageScore === null) return QUALITY_GLOBAL_MEAN;
  const R = averageScore / 10; // 0–100 -> 0–10
  const v = Math.max(0, popularity);
  const m = QUALITY_MIN_VOTES;
  const C = QUALITY_GLOBAL_MEAN;
  return (v / (v + m)) * R + (m / (v + m)) * C;
}

export function tagMatch(
  media: Media,
  profile: TasteProfile
): { value: number; contributions: TagContribution[] } {
  const contributions: TagContribution[] = [];
  let value = 0;
  for (const tag of media.tags) {
    const aff = profile.tags[tag.id];
    if (!aff) continue;
    const v = aff.affinity * (tag.rank / 100);
    if (v === 0) continue;
    value += v;
    contributions.push({ tagId: tag.id, name: tag.name, value: v });
  }
  contributions.sort((a, b) => Math.abs(b.value) - Math.abs(a.value));
  return { value, contributions };
}

export function scoreCandidate(
  media: Media,
  profile: TasteProfile,
  communityBoost: number
): ScoredCandidate {
  const { value: match, contributions } = tagMatch(media, profile);
  const qualityPrior = bayesianRating(media.averageScore, media.popularity);
  const base = W_MATCH * match + W_QUALITY * qualityPrior + W_COMMUNITY * communityBoost;
  return { media, base, tagMatch: match, qualityPrior, communityBoost, contributions };
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npm test -- scoring`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/recommend/scoring.ts src/lib/recommend/__tests__/scoring.test.ts
git commit -m "feat: add candidate scoring for recommendations"
```

---

### Task 3: Candidate similarity & MMR diversity re-rank

**Files:**
- Create: `src/lib/recommend/mmr.ts`
- Test: `src/lib/recommend/__tests__/mmr.test.ts`

**Interfaces:**
- Consumes: `Media`; `ScoredCandidate` (scoring.ts).
- Produces:
  - `function tagCosine(a: Media, b: Media): number` — cosine similarity of rank-weighted tag vectors (0–1; 0 when no shared tags).
  - `function mmrRerank(candidates: ScoredCandidate[], lambda: number, topN: number): ScoredCandidate[]` — Maximal Marginal Relevance. `lambda` in [0,1] is the relevance weight (1 = pure base-score order, lower = more diverse). Greedily picks the candidate maximizing `lambda*normBase - (1-lambda)*maxSimToSelected`, where `normBase` is the base score min-max normalized to [0,1] across the pool.

- [ ] **Step 1: Write the failing test at `src/lib/recommend/__tests__/mmr.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { tagCosine, mmrRerank } from "@/lib/recommend/mmr";
import type { ScoredCandidate } from "@/lib/recommend/scoring";
import type { Media, MediaTag } from "@/lib/anilist/types";

function media(id: number, tags: [number, number][]): Media {
  return {
    id, type: "ANIME", title: `T${id}`, coverImage: null, bannerImage: null,
    description: null, genres: [], format: "TV", episodes: 12, chapters: null,
    averageScore: 70, popularity: 1000, seasonYear: 2020, relations: [],
    tags: tags.map(([tid, rank]) => ({ id: tid, name: `t${tid}`, rank } as MediaTag)),
  };
}
const cand = (id: number, base: number, tags: [number, number][]): ScoredCandidate => ({
  media: media(id, tags), base, tagMatch: base, qualityPrior: 0, communityBoost: 0, contributions: [],
});

describe("tagCosine", () => {
  it("is 1 for identical tag vectors and 0 for disjoint", () => {
    expect(tagCosine(media(1, [[10, 100]]), media(2, [[10, 100]]))).toBeCloseTo(1);
    expect(tagCosine(media(1, [[10, 100]]), media(2, [[20, 100]]))).toBe(0);
  });
});

describe("mmrRerank", () => {
  it("with lambda=1 returns pure base-score order", () => {
    const pool = [cand(1, 1, [[10, 100]]), cand(2, 3, [[10, 100]]), cand(3, 2, [[10, 100]])];
    const out = mmrRerank(pool, 1, 3).map((c) => c.media.id);
    expect(out).toEqual([2, 3, 1]);
  });

  it("with low lambda prefers a diverse second pick over a near-duplicate", () => {
    // 1 is top; 2 is a near-duplicate of 1; 3 is slightly lower but different.
    const pool = [
      cand(1, 10, [[10, 100]]),
      cand(2, 9, [[10, 100]]),
      cand(3, 8, [[20, 100]]),
    ];
    const out = mmrRerank(pool, 0.2, 3).map((c) => c.media.id);
    expect(out[0]).toBe(1);
    expect(out[1]).toBe(3); // diversity beats the near-duplicate #2
  });

  it("caps output at topN", () => {
    const pool = [cand(1, 1, [[10, 100]]), cand(2, 2, [[10, 100]]), cand(3, 3, [[10, 100]])];
    expect(mmrRerank(pool, 1, 2)).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- mmr`
Expected: FAIL — cannot find module `@/lib/recommend/mmr`.

- [ ] **Step 3: Implement `src/lib/recommend/mmr.ts`**

```ts
import type { Media } from "@/lib/anilist/types";
import type { ScoredCandidate } from "./scoring";

export function tagCosine(a: Media, b: Media): number {
  const va = new Map(a.tags.map((t) => [t.id, t.rank / 100]));
  const vb = new Map(b.tags.map((t) => [t.id, t.rank / 100]));
  let dot = 0;
  for (const [id, wa] of va) {
    const wb = vb.get(id);
    if (wb) dot += wa * wb;
  }
  const mag = (m: Map<number, number>) =>
    Math.sqrt([...m.values()].reduce((s, w) => s + w * w, 0));
  const denom = mag(va) * mag(vb);
  return denom === 0 ? 0 : dot / denom;
}

export function mmrRerank(
  candidates: ScoredCandidate[],
  lambda: number,
  topN: number
): ScoredCandidate[] {
  if (candidates.length === 0) return [];
  const bases = candidates.map((c) => c.base);
  const min = Math.min(...bases);
  const max = Math.max(...bases);
  const norm = (b: number) => (max === min ? 1 : (b - min) / (max - min));

  const remaining = [...candidates];
  const selected: ScoredCandidate[] = [];

  while (selected.length < topN && remaining.length > 0) {
    let bestIdx = 0;
    let bestScore = -Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const rel = norm(remaining[i].base);
      let maxSim = 0;
      for (const s of selected) {
        const sim = tagCosine(remaining[i].media, s.media);
        if (sim > maxSim) maxSim = sim;
      }
      const mmr = lambda * rel - (1 - lambda) * maxSim;
      if (mmr > bestScore) {
        bestScore = mmr;
        bestIdx = i;
      }
    }
    selected.push(remaining.splice(bestIdx, 1)[0]);
  }
  return selected;
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npm test -- mmr`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/recommend/mmr.ts src/lib/recommend/__tests__/mmr.test.ts
git commit -m "feat: add MMR diversity re-ranking for recommendations"
```

---

### Task 4: Filters (exclusions, sequels) & explanations

**Files:**
- Create: `src/lib/recommend/filters.ts`
- Create: `src/lib/recommend/explain.ts`
- Test: `src/lib/recommend/__tests__/filters.test.ts`
- Test: `src/lib/recommend/__tests__/explain.test.ts`

**Interfaces:**
- Consumes: `Media`, `MediaStub`; `ScoredCandidate`; `relatedByType`.
- Produces:
  - `interface ExclusionFilters { genres: string[]; formats: string[] }`
  - `function applyFilters(candidates: ScoredCandidate[], filters: ExclusionFilters): ScoredCandidate[]` — drops candidates whose genres intersect `filters.genres` or whose format is in `filters.formats` (case-insensitive genre compare).
  - `function isUnwatchedSequel(candidate: Media, listedIds: Set<number>): boolean` — true if the candidate has a PREQUEL relation whose id is NOT in `listedIds` (i.e., a sequel to something the user hasn't added).
  - `interface RecommendationReason { tags: string[] }`
  - `function buildReason(candidate: ScoredCandidate, maxTags?: number): RecommendationReason` — top positive tag-contribution names (default 3).

- [ ] **Step 1: Write the failing tests**

`src/lib/recommend/__tests__/filters.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { applyFilters, isUnwatchedSequel } from "@/lib/recommend/filters";
import type { ScoredCandidate } from "@/lib/recommend/scoring";
import type { Media } from "@/lib/anilist/types";

function media(id: number, genres: string[], format: string, relations: Media["relations"] = []): Media {
  return {
    id, type: "ANIME", title: `T${id}`, coverImage: null, bannerImage: null,
    description: null, genres, tags: [], format: format as Media["format"], episodes: 12,
    chapters: null, averageScore: 70, popularity: 1000, seasonYear: 2020, relations,
  };
}
const cand = (m: Media): ScoredCandidate => ({
  media: m, base: 1, tagMatch: 1, qualityPrior: 0, communityBoost: 0, contributions: [],
});

describe("applyFilters", () => {
  it("drops candidates matching an excluded genre (case-insensitive)", () => {
    const pool = [cand(media(1, ["Ecchi"], "TV")), cand(media(2, ["Action"], "TV"))];
    const out = applyFilters(pool, { genres: ["ecchi"], formats: [] });
    expect(out.map((c) => c.media.id)).toEqual([2]);
  });

  it("drops candidates matching an excluded format", () => {
    const pool = [cand(media(1, [], "MOVIE")), cand(media(2, [], "TV"))];
    const out = applyFilters(pool, { genres: [], formats: ["MOVIE"] });
    expect(out.map((c) => c.media.id)).toEqual([2]);
  });
});

describe("isUnwatchedSequel", () => {
  it("is true when a prequel is not on the user's list", () => {
    const seq = media(2, [], "TV", [
      { relationType: "PREQUEL", node: { id: 1, title: "S1", coverImage: null, format: "TV" } },
    ]);
    expect(isUnwatchedSequel(seq, new Set<number>())).toBe(true);
    expect(isUnwatchedSequel(seq, new Set<number>([1]))).toBe(false);
  });

  it("is false with no prequel relation", () => {
    expect(isUnwatchedSequel(media(5, [], "TV"), new Set<number>())).toBe(false);
  });
});
```

`src/lib/recommend/__tests__/explain.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { buildReason } from "@/lib/recommend/explain";
import type { ScoredCandidate } from "@/lib/recommend/scoring";

const cand: ScoredCandidate = {
  media: { id: 1 } as never, base: 5, tagMatch: 5, qualityPrior: 0, communityBoost: 0,
  contributions: [
    { tagId: 10, name: "Time Loop", value: 3 },
    { tagId: 20, name: "Psychological", value: 2 },
    { tagId: 30, name: "Boring", value: -4 },
    { tagId: 40, name: "Sci-Fi", value: 1 },
  ],
};

describe("buildReason", () => {
  it("returns the top positive tags only, capped", () => {
    const r = buildReason(cand, 2);
    expect(r.tags).toEqual(["Time Loop", "Psychological"]);
  });

  it("omits negative contributions", () => {
    expect(buildReason(cand).tags).not.toContain("Boring");
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npm test -- filters explain`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement `src/lib/recommend/filters.ts`**

```ts
import type { Media } from "@/lib/anilist/types";
import { relatedByType } from "@/lib/anilist/relations";
import type { ScoredCandidate } from "./scoring";

export interface ExclusionFilters {
  genres: string[];
  formats: string[];
}

export function applyFilters(
  candidates: ScoredCandidate[],
  filters: ExclusionFilters
): ScoredCandidate[] {
  const genreSet = new Set(filters.genres.map((g) => g.toLowerCase()));
  const formatSet = new Set(filters.formats);
  return candidates.filter((c) => {
    if (c.media.format && formatSet.has(c.media.format)) return false;
    if (c.media.genres.some((g) => genreSet.has(g.toLowerCase()))) return false;
    return true;
  });
}

export function isUnwatchedSequel(candidate: Media, listedIds: Set<number>): boolean {
  const prequels = relatedByType(candidate, "PREQUEL");
  if (prequels.length === 0) return false;
  return prequels.some((p) => !listedIds.has(p.id));
}
```

- [ ] **Step 4: Implement `src/lib/recommend/explain.ts`**

```ts
import type { ScoredCandidate } from "./scoring";

export interface RecommendationReason {
  tags: string[];
}

export function buildReason(candidate: ScoredCandidate, maxTags = 3): RecommendationReason {
  const tags = candidate.contributions
    .filter((c) => c.value > 0)
    .slice(0, maxTags)
    .map((c) => c.name);
  return { tags };
}
```

- [ ] **Step 5: Run to verify they pass**

Run: `npm test -- filters explain`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/recommend/filters.ts src/lib/recommend/explain.ts src/lib/recommend/__tests__/filters.test.ts src/lib/recommend/__tests__/explain.test.ts
git commit -m "feat: add recommendation filters and explanations"
```

---

### Task 5: /api/recommendations orchestration route

**Files:**
- Create: `src/lib/recommend/engine.ts` (pure orchestration over already-fetched data)
- Create: `src/app/api/recommendations/route.ts`
- Test: `src/lib/recommend/__tests__/engine.test.ts`
- Test: `src/app/api/recommendations/__tests__/route.test.ts`

**Interfaces:**
- Consumes: `buildTasteProfile`, `scoreCandidate`, `RatedTitle`, `TasteProfile`, `ScoredCandidate`; `getMediaByIds`, `getRecommendationsFor`; `Media`; `ListStatus`.
- Produces:
  - `interface ListInput { id: number; score: number | null; status: ListStatus }`
  - `interface RecommendationPoolItem { media: Media; base: number; tagMatch: number; qualityPrior: number; communityBoost: number; contributions: TagContribution[] }` (i.e. `ScoredCandidate`)
  - `function assemblePool(args: { rated: RatedTitle[]; candidateMedia: Media[]; communityRaw: { candidateId: number; rating: number; sourceScoreSignal: number }[]; listedIds: Set<number> }): { profile: TasteProfile; pool: ScoredCandidate[] }` — pure: builds the profile, aggregates community boost per candidate (Σ rating×positiveSourceSignal, min-max normalized to 0–1), scores every candidate that is NOT already listed **and is not an unwatched sequel** (`isUnwatchedSequel`), sorts by base desc.
  - `POST(request)` at `/api/recommendations` — body `{ list: ListInput[] }`; fetches rated media (`getMediaByIds`), fetches community recs for the top-rated listed titles, fetches candidate media, calls `assemblePool`, returns `{ profile, pool }`. Empty/failed → `{ profile: null, pool: [] }` with a `coldStart` flag when the list has no scored titles.

- [ ] **Step 1: Write the failing test at `src/lib/recommend/__tests__/engine.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { assemblePool } from "@/lib/recommend/engine";
import type { RatedTitle } from "@/lib/recommend/types";
import type { Media, MediaTag } from "@/lib/anilist/types";

function media(id: number, tags: [number, string, number][]): Media {
  return {
    id, type: "ANIME", title: `T${id}`, coverImage: null, bannerImage: null,
    description: null, genres: [], format: "TV", episodes: 12, chapters: null,
    averageScore: 75, popularity: 20000, seasonYear: 2020, relations: [],
    tags: tags.map(([tid, name, rank]) => ({ id: tid, name, rank } as MediaTag)),
  };
}

describe("assemblePool", () => {
  const rated: RatedTitle[] = [
    { media: media(1, [[10, "Time Loop", 100]]), score: 9, status: "completed" },
    { media: media(2, [[20, "Romance", 100]]), score: 5, status: "completed" },
  ];

  it("excludes already-listed candidates and scores the rest", () => {
    const candidateMedia = [media(1, [[10, "Time Loop", 100]]), media(3, [[10, "Time Loop", 100]])];
    const { profile, pool } = assemblePool({
      rated, candidateMedia, communityRaw: [], listedIds: new Set([1, 2]),
    });
    expect(profile.tags[10].affinity).toBeGreaterThan(0);
    expect(pool.map((c) => c.media.id)).toEqual([3]); // 1 is listed
  });

  it("adds community boost and sorts by base desc", () => {
    const candidateMedia = [media(3, [[10, "Time Loop", 100]]), media(4, [[10, "Time Loop", 100]])];
    const { pool } = assemblePool({
      rated, candidateMedia,
      communityRaw: [{ candidateId: 4, rating: 100, sourceScoreSignal: 2 }],
      listedIds: new Set([1, 2]),
    });
    expect(pool[0].media.id).toBe(4); // community boost lifts 4 above 3
    expect(pool[0].communityBoost).toBeGreaterThan(0);
  });

  it("drops candidates that are sequels of an unwatched title", () => {
    const sequel = media(5, [[10, "Time Loop", 100]]);
    sequel.relations = [
      { relationType: "PREQUEL", node: { id: 900, title: "S1", coverImage: null, format: "TV" } },
    ];
    const { pool } = assemblePool({
      rated, candidateMedia: [sequel], communityRaw: [], listedIds: new Set([1, 2]),
    });
    expect(pool).toHaveLength(0); // prequel 900 is not on the list
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- engine`
Expected: FAIL — cannot find module `@/lib/recommend/engine`.

- [ ] **Step 3: Implement `src/lib/recommend/engine.ts`**

```ts
import type { Media } from "@/lib/anilist/types";
import type { RatedTitle, TasteProfile } from "./types";
import { buildTasteProfile } from "./profile";
import { scoreCandidate, type ScoredCandidate } from "./scoring";
import { isUnwatchedSequel } from "./filters";

export function assemblePool(args: {
  rated: RatedTitle[];
  candidateMedia: Media[];
  communityRaw: { candidateId: number; rating: number; sourceScoreSignal: number }[];
  listedIds: Set<number>;
}): { profile: TasteProfile; pool: ScoredCandidate[] } {
  const { rated, candidateMedia, communityRaw, listedIds } = args;
  const profile = buildTasteProfile(rated);

  // Aggregate raw community weight per candidate (positive source signal only).
  const rawBoost = new Map<number, number>();
  for (const c of communityRaw) {
    if (c.sourceScoreSignal <= 0) continue;
    rawBoost.set(c.candidateId, (rawBoost.get(c.candidateId) ?? 0) + c.rating * c.sourceScoreSignal);
  }
  const maxBoost = Math.max(0, ...rawBoost.values());
  const boostOf = (id: number) =>
    maxBoost > 0 ? (rawBoost.get(id) ?? 0) / maxBoost : 0;

  const pool = candidateMedia
    .filter((m) => !listedIds.has(m.id))
    .filter((m) => !isUnwatchedSequel(m, listedIds)) // smart sequel handling (spec §4)
    .map((m) => scoreCandidate(m, profile, boostOf(m.id)))
    .sort((a, b) => b.base - a.base);

  return { profile, pool };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- engine`
Expected: PASS.

- [ ] **Step 5: Implement `src/app/api/recommendations/route.ts`**

```ts
import { getMediaByIds, getRecommendationsFor } from "@/lib/anilist/media";
import type { Media } from "@/lib/anilist/types";
import type { ListStatus } from "@/lib/list/schema";
import { assemblePool } from "@/lib/recommend/engine";
import { NEUTRAL_MEAN } from "@/lib/recommend/constants";
import type { RatedTitle } from "@/lib/recommend/types";

interface ListInput { id: number; score: number | null; status: ListStatus }

const TOP_SOURCES = 15;   // fetch community recs for this many top-rated titles
const MAX_CANDIDATES = 80;

export async function POST(request: Request): Promise<Response> {
  let list: ListInput[] = [];
  try {
    const body = (await request.json()) as { list?: ListInput[] };
    list = Array.isArray(body.list) ? body.list : [];
  } catch {
    return Response.json({ profile: null, pool: [], coldStart: true });
  }

  const scored = list.filter((e) => e.score !== null);
  if (scored.length === 0) {
    return Response.json({ profile: null, pool: [], coldStart: true });
  }

  try {
    const listedIds = new Set(list.map((e) => e.id));
    const ratedMedia = await getMediaByIds(list.map((e) => e.id));
    const mediaById = new Map(ratedMedia.map((m) => [m.id, m]));

    const rated: RatedTitle[] = list
      .map((e) => {
        const media = mediaById.get(e.id);
        return media ? { media, score: e.score, status: e.status } : null;
      })
      .filter((x): x is RatedTitle => x !== null);

    // Mean for source-signal weighting of community recs.
    const mean =
      scored.length >= 2
        ? scored.reduce((s, e) => s + (e.score as number), 0) / scored.length
        : NEUTRAL_MEAN;

    const topSources = [...rated]
      .filter((r) => r.score !== null)
      .sort((a, b) => (b.score as number) - (a.score as number))
      .slice(0, TOP_SOURCES);

    const recLists = await Promise.all(
      topSources.map(async (src) => ({
        signal: (src.score as number) - mean,
        recs: await getRecommendationsFor(src.media.id),
      }))
    );

    const communityRaw: { candidateId: number; rating: number; sourceScoreSignal: number }[] = [];
    const candidateIds = new Set<number>();
    for (const { signal, recs } of recLists) {
      for (const rec of recs) {
        if (listedIds.has(rec.mediaId)) continue;
        communityRaw.push({ candidateId: rec.mediaId, rating: rec.rating, sourceScoreSignal: signal });
        candidateIds.add(rec.mediaId);
      }
    }

    const candidateMedia: Media[] =
      candidateIds.size > 0
        ? await getMediaByIds([...candidateIds].slice(0, MAX_CANDIDATES))
        : [];

    const { profile, pool } = assemblePool({ rated, candidateMedia, communityRaw, listedIds });
    return Response.json({ profile, pool, coldStart: false });
  } catch {
    return Response.json({ profile: null, pool: [], error: "fetch_failed" }, { status: 502 });
  }
}
```

- [ ] **Step 6: Write the route test at `src/app/api/recommendations/__tests__/route.test.ts`**

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "@/app/api/recommendations/route";
import * as media from "@/lib/anilist/media";
import type { Media, MediaTag } from "@/lib/anilist/types";

function m(id: number, tags: [number, string, number][]): Media {
  return {
    id, type: "ANIME", title: `T${id}`, coverImage: null, bannerImage: null,
    description: null, genres: [], format: "TV", episodes: 12, chapters: null,
    averageScore: 75, popularity: 20000, seasonYear: 2020, relations: [],
    tags: tags.map(([tid, name, rank]) => ({ id: tid, name, rank } as MediaTag)),
  };
}
const req = (body: unknown) =>
  new Request("http://x/api/recommendations", { method: "POST", body: JSON.stringify(body) });

describe("/api/recommendations", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("returns coldStart when no scored titles", async () => {
    const res = await POST(req({ list: [{ id: 1, score: null, status: "planning" }] }));
    expect(await res.json()).toEqual({ profile: null, pool: [], coldStart: true });
  });

  it("returns a scored pool for a rated list", async () => {
    vi.spyOn(media, "getMediaByIds").mockImplementation(async (ids: number[]) =>
      ids.map((id) => m(id, [[10, "Time Loop", 100]]))
    );
    vi.spyOn(media, "getRecommendationsFor").mockResolvedValue([
      { mediaId: 99, rating: 50, media: { id: 99, title: "R", coverImage: null, format: "TV" } },
    ]);
    const res = await POST(req({ list: [{ id: 1, score: 9, status: "completed" }] }));
    const body = await res.json();
    expect(body.coldStart).toBe(false);
    expect(body.pool.some((c: { media: { id: number } }) => c.media.id === 99)).toBe(true);
  });
});
```

- [ ] **Step 7: Run to verify it passes**

Run: `npm test -- recommendations`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/lib/recommend/engine.ts src/app/api/recommendations/route.ts src/lib/recommend/__tests__/engine.test.ts src/app/api/recommendations/__tests__/route.test.ts
git commit -m "feat: add recommendations orchestration route"
```

---

### Task 6: Recommendations page & interactive view

**Files:**
- Create: `src/lib/recommend/present.ts` (pure client-side re-rank pipeline: filters + MMR + reasons)
- Create: `src/components/RecommendationsView.tsx` (Client Component)
- Create: `src/app/recommendations/page.tsx`
- Modify: `src/components/Navbar.tsx` (add "For You" link)
- Modify: `src/app/page.tsx` (optional "Recommended for you" hint card linking to /recommendations — see step)
- Test: `src/lib/recommend/__tests__/present.test.ts`

**Interfaces:**
- Consumes: `ScoredCandidate`, `mmrRerank`, `applyFilters`, `buildReason`, `ExclusionFilters`; `useListStore`; `getTrending` (cold-start fallback via `/api/media`? no — cold start links to search); `MediaCard`, `MediaCardData`.
- Produces:
  - `interface PresentedRec { media: Media; reasonTags: string[] }`
  - `function presentRecommendations(pool: ScoredCandidate[], opts: { diversity: number; filters: ExclusionFilters; topN: number }): PresentedRec[]` — pure: `applyFilters` → `mmrRerank` (map diversity dial 0–1 to lambda `1 - 0.7*diversity`) → attach `buildReason` tags.
  - `RecommendationsView` — reads the list from `useListStore`, POSTs `{ list }` to `/api/recommendations`, holds `{ pool, profile, status }`; renders a diversity slider + genre-exclusion chips; calls `presentRecommendations` on every dial/filter change (instant, no refetch); shows a "why" chip row under each card; handles loading / error / coldStart (empty list → prompt to add titles, link to `/search`).

- [ ] **Step 1: Write the failing test at `src/lib/recommend/__tests__/present.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { presentRecommendations } from "@/lib/recommend/present";
import type { ScoredCandidate } from "@/lib/recommend/scoring";
import type { Media } from "@/lib/anilist/types";

function media(id: number, genres: string[]): Media {
  return {
    id, type: "ANIME", title: `T${id}`, coverImage: null, bannerImage: null,
    description: null, genres, tags: [], format: "TV", episodes: 12, chapters: null,
    averageScore: 70, popularity: 1000, seasonYear: 2020, relations: [],
  };
}
const cand = (id: number, base: number, genres: string[] = []): ScoredCandidate => ({
  media: media(id, genres), base, tagMatch: base, qualityPrior: 0, communityBoost: 0,
  contributions: [{ tagId: 1, name: "Action", value: 2 }],
});

describe("presentRecommendations", () => {
  it("applies exclusion filters then ranks and attaches reasons", () => {
    const pool = [cand(1, 3, ["Ecchi"]), cand(2, 2), cand(3, 1)];
    const out = presentRecommendations(pool, {
      diversity: 1, filters: { genres: ["Ecchi"], formats: [] }, topN: 10,
    });
    expect(out.map((r) => r.media.id)).toEqual([2, 3]); // 1 filtered
    expect(out[0].reasonTags).toContain("Action");
  });

  it("caps at topN", () => {
    const pool = [cand(1, 3), cand(2, 2), cand(3, 1)];
    expect(presentRecommendations(pool, {
      diversity: 1, filters: { genres: [], formats: [] }, topN: 2,
    })).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- present`
Expected: FAIL — cannot find module `@/lib/recommend/present`.

- [ ] **Step 3: Implement `src/lib/recommend/present.ts`**

```ts
import type { Media } from "@/lib/anilist/types";
import type { ScoredCandidate } from "./scoring";
import { mmrRerank } from "./mmr";
import { applyFilters, type ExclusionFilters } from "./filters";
import { buildReason } from "./explain";

export interface PresentedRec {
  media: Media;
  reasonTags: string[];
}

export function presentRecommendations(
  pool: ScoredCandidate[],
  opts: { diversity: number; filters: ExclusionFilters; topN: number }
): PresentedRec[] {
  const filtered = applyFilters(pool, opts.filters);
  const lambda = 1 - 0.7 * Math.min(1, Math.max(0, opts.diversity));
  const ranked = mmrRerank(filtered, lambda, opts.topN);
  return ranked.map((c) => ({ media: c.media, reasonTags: buildReason(c).tags }));
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- present`
Expected: PASS.

- [ ] **Step 5: Implement `src/components/RecommendationsView.tsx`**

```tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useListStore } from "@/lib/list/reactive";
import { MediaCard } from "@/components/MediaCard";
import { presentRecommendations } from "@/lib/recommend/present";
import type { ScoredCandidate } from "@/lib/recommend/scoring";
import type { ExclusionFilters } from "@/lib/recommend/filters";

type Status = "idle" | "loading" | "error" | "cold" | "ready";

const GENRE_OPTIONS = ["Ecchi", "Horror", "Hentai", "Sports", "Mahou Shoujo", "Kids"];

export function RecommendationsView() {
  const store = useListStore();
  const listKey = Object.keys(store.entries).join(",");

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
```

- [ ] **Step 6: Implement `src/app/recommendations/page.tsx`**

```tsx
import { RecommendationsView } from "@/components/RecommendationsView";

export default function RecommendationsPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <span className="h-6 w-1.5 rounded-full bg-gradient-to-b from-primary to-accent" />
        <h1 className="font-display text-2xl font-bold tracking-tight">For You</h1>
      </div>
      <RecommendationsView />
    </div>
  );
}
```

- [ ] **Step 7: Add the "For You" link to `src/components/Navbar.tsx`**

Add before the "My List" link, mirroring its styling:

```tsx
<Link
  href="/recommendations"
  className="rounded-full px-3 py-1.5 text-muted-foreground transition-colors hover:bg-surface-hover hover:text-foreground"
>
  For You
</Link>
```

- [ ] **Step 8: Run tests, typecheck, and build**

Run: `npm test`
Expected: all PASS.

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `npm run build`
Expected: build succeeds; `/recommendations` and `/api/recommendations` compile.

- [ ] **Step 9: Commit**

```bash
git add src/lib/recommend/present.ts src/components/RecommendationsView.tsx src/app/recommendations/page.tsx src/components/Navbar.tsx src/lib/recommend/__tests__/present.test.ts
git commit -m "feat: add recommendations page with diversity dial and filters"
```

---

## Self-Review Notes

- **Spec coverage (recommendation slice, §4):** score-centering + tag affinity + negative signals + shrinkage → Task 1. Bayesian quality prior + tag-match + community boost → Tasks 2 & 5. MMR diversity dial → Task 3 + Task 6 (`present.ts`). "Why" explanations → Task 4 + surfaced in Task 6. Exclusion filters → Task 4 + Task 6 UI. Cold-start → Task 5 (`coldStart` flag) + Task 6 (empty-list prompt). Smart sequel handling → `isUnwatchedSequel` (Task 4) **enforced in `assemblePool`** (Task 5), so sequels of unwatched titles never appear as recommendations.
- **Purity:** everything in `src/lib/recommend/*` except `engine.ts`'s consumers is pure and unit-tested; `engine.assemblePool` is pure; only the route handler and the view do I/O.
- **Interactive performance:** the expensive fetch+score happens once server-side; the dial and filters re-run `presentRecommendations` (pure) client-side, so tweaks are instant.
- **Type consistency:** `RatedTitle`/`TasteProfile`/`TagAffinity` (Task 1), `ScoredCandidate`/`TagContribution` (Task 2), `ExclusionFilters` (Task 4), `PresentedRec` (Task 6) each defined once and reused by name downstream.
- **Deferred to Plan 4 (Stats):** the stats dashboard and its charts, plus the taste-profile visualization (which will render `TasteProfile.tags` built here). A dedicated "Continue watching" row (surfacing the sequels we *suppress* here) is also a Plan 4 candidate.
