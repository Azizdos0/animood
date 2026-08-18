# Animood — Phase 1 Design Spec

**Date:** 2026-08-18
**Status:** Approved, ready for implementation planning
**Scope:** Phase 1 only (no accounts, no server DB, no social features)

## 1. Vision

A modern, fast alternative to MyAnimeList. The two things we fix relative to MAL:
a clean, contemporary UI, and a genuinely smart, explainable recommendation engine.

Built in phases so we can ship a usable single-user app before taking on auth and
social complexity:

- **Phase 1 (this spec):** Browse/search anime & manga, title detail pages,
  local-storage list tracking, a stats dashboard, and the recommendation engine.
  No accounts, no backend database.
- **Phase 2 (later):** Real authentication; migrate localStorage lists to
  server-persisted user accounts.
- **Phase 3 (later):** Social layer — reviews, comments, following, forums — built
  on Phase 2 accounts.

The architecture is chosen so Phases 2/3 slot in without a rewrite.

## 2. Tech stack

- **Next.js (App Router) + TypeScript** — modern UI, server-side data fetching with
  built-in caching, and a clean path to add auth/API routes later.
- **Tailwind CSS** — styling.
- **Data source:** AniList public GraphQL API (rate-limited ~90 req/min).
- **Persistence (Phase 1):** browser `localStorage` for the user's personal list only.
  No database.

## 3. Architecture & data flow

```
Browser (React UI)  ──►  Next.js server layer  ──►  AniList GraphQL API
   │                        (fetch + cache)
   │
   └──►  localStorage  (your list: status, score, progress)
```

- **Server layer** fetches anime/manga data from AniList and caches responses. This
  keeps browsing fast, stays under AniList rate limits, and keeps heavy data out of
  the client bundle. In Phase 2 this same layer starts reading from our own DB.
- **localStorage** holds *only the user's personal list* — a small JSON structure
  keyed by AniList media ID: `{ status, score, progress, updatedAt }`. This is the
  thing that becomes a real DB table in Phase 2.
- **No database in Phase 1.** Nothing to host or migrate yet.

### localStorage schema (versioned)

```
{
  version: 1,
  entries: {
    [mediaId: number]: {
      status: "watching" | "completed" | "planning" | "dropped" | "onhold",
      score: number | null,     // user's rating on a 1-10 scale (null = unrated)
      progress: number,         // episodes/chapters watched/read
      updatedAt: string         // ISO timestamp
    }
  }
}
```

The `version` field exists so Phase 2 can migrate cleanly. All reads/writes go
through a wrapped, validated data layer; corrupt data degrades to an empty list
rather than crashing.

## 4. The recommendation engine

Architecture is **hybrid**: AniList community recommendations generate a candidate
pool (strategy A), and a content-based taste-profile algorithm re-ranks and explains
them (strategy B). Everything runs client-side over the user's list + AniList data.

> Note: collaborative filtering ("users like you also watched…") requires many users'
> lists stored server-side and is explicitly out of scope until Phase 2/3. The design
> leans toward it without depending on it.

### The ranking algorithm

1. **Score-centering.** Center every user score around the user's personal average,
   so a rating only counts as positive/negative *relative to how they normally rate*.
   Captures genuine preference rather than mere exposure.

2. **Tag-level affinity.** Beyond coarse genres (~20), use AniList **tags**
   (hundreds, each with a per-title rank %). For each tag, affinity = weighted average
   of the user's centered scores across titles carrying it, weighted by tag rank %.

3. **Negative signals.** Dropped / low-rated titles push their tags *down*, so the
   engine learns what to stop recommending. (MAL only knows what you added.)

4. **Confidence shrinkage.** Affinities computed from few samples are pulled toward
   neutral (Bayesian shrinkage) so a single outlier title can't dominate.

5. **Candidate scoring.** Each candidate title's score =
   `tag-match` + `quality prior` + `community boost`, where:
   - **tag-match** = how well the candidate's tags align with the user's affinities.
   - **quality prior** = Bayesian-weighted rating (IMDB-style) so hidden gems aren't
     beaten by low-sample flukes; popularity is log-dampened to avoid parroting the
     most popular titles.
   - **community boost** = candidate also appeared in the AniList community-rec
     aggregation (strategy A).

6. **Diversity re-rank (MMR).** Apply Maximal Marginal Relevance: after selecting a
   top rec, penalize subsequent candidates too similar to already-selected ones. The
   user-facing **diversity ("surprise me") dial** is the MMR lambda knob — "safe" =
   pure match, "surprise me" = reward novelty.

7. **Explainability.** The top contributing tags/titles to a candidate's score are
   surfaced as the **"why" tag** (e.g. "Recommended because you rated *Steins;Gate*
   and *Erased* highly — Time Loop, Psychological").

### MAL-annoyance differentiators (Phase 1)

- **"Why" tags** on every recommendation (falls out of the algorithm).
- **Smart sequel handling.** Use AniList relation data so we never recommend a sequel
  of an unwatched title; instead surface a dedicated **"Continue watching"** row.
- **Diversity / "surprise me" dial** (the MMR knob).
- **Exclusion filters** — hide unwanted genres/formats; filter to e.g. only-movies /
  only-finished.
- **Cold start** — an empty list falls back to trending, plus a quick
  "tap ~5 titles you liked" onboarding to seed the taste profile fast.

### Performance tradeoff

The algorithm runs in the browser over the user's list. For very large lists we cap
the candidate pool and fetch candidate data lazily; it should be fast for normal-sized
lists and degrade gracefully. Phase 2's server can move this off-device later.

## 5. Pages & components

- **Home** — trending/popular rows; a "Recommended for you" row once the list has data.
- **Browse / Search** — search with filters (genre, format, year, status, sort); grid
  of title cards.
- **Title detail** — cover, synopsis, tags, stats, relations (with "Continue watching"
  surfacing), and an add/update-to-list control (status, score, progress).
- **My List** — tracked titles grouped by status
  (Watching / Completed / Planning / Dropped / On-hold), editable inline.
- **Recommendations** — full algorithm output with the diversity dial, exclusion
  filters, and "why" tags per pick.
- **Stats** — the dashboard (section 6).

Shared building blocks: a **media-card** component, a **list-editor** control, and an
**AniList data layer** (server-side fetch + cache wrappers).

## 6. Stats dashboard

Computed entirely from the local list + cached AniList metadata:

- Score distribution
- Genre / tag breakdown (what the user actually watches)
- Format split (TV / movie / OVA / …)
- Total episodes & estimated time watched
- Completion rate
- Activity over time
- **Taste profile** view — visualizes the affinity scores the recommender uses, so
  stats and recommendations reinforce each other.

## 7. Error handling & resilience

- **AniList rate-limit / downtime** — server layer caches aggressively, retries with
  backoff, and the UI shows cached data with a soft "couldn't refresh" notice rather
  than breaking.
- **localStorage** — reads/writes wrapped and validated against the versioned schema;
  corrupt data degrades to an empty list.
- **Empty states** everywhere — no list yet → cold-start onboarding; no search
  results → suggestions.

## 8. Testing

- **Unit tests** for the recommendation algorithm — the critical, logic-heavy piece.
  Score-centering, tag affinity, negative signals, shrinkage, quality prior, and MMR
  each tested with fixtures.
- **Unit tests** for the localStorage / list data layer (schema validation, migration
  hooks, corrupt-data handling).
- **Component tests** for the list-editor and media-card interactions.
- **AniList data layer** tested against recorded/mock responses so tests never hit the
  real API.

## 9. Explicitly out of scope for Phase 1

- Authentication, passwords, user accounts.
- Any server-side database.
- Social features: reviews, comments, following, forums, activity feeds.
- Collaborative-filtering recommendations.
