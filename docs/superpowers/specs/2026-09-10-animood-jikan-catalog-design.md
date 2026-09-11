# Animood — Catalog Migration to Jikan/MAL (anime-only) Design Spec

**Date:** 2026-09-10
**Status:** Approved (owner delegated design + implementation), ready for implementation planning
**Scope:** Replace the AniList catalog source with Jikan (MyAnimeList), anime-only, with a Supabase catalog cache. Reset existing AniList-ID-keyed data.

## 1. Vision

AniList's public GraphQL API is disabled upstream (HTTP 403, "temporarily disabled due to
severe stability issues"), which breaks Animood's entire catalog — search, trending, media
detail, and the metadata behind My List / Stats / recommendations / feed / discussions. This
migrates the catalog data source to **Jikan** (`https://api.jikan.moe/v4`, the free
no-auth MyAnimeList API), **anime-only for now**, behind a **Supabase cache** so the app's
batch-by-id access pattern stays fast despite Jikan's per-title, rate-limited endpoints.

The `Media` type contract and the public fetch-function signatures are preserved, so UI
consumers are untouched; only the data source, the canonical ID space, and the fetch
internals change.

## 2. Decisions (owner-delegated)

- **Source:** Jikan v4 (MyAnimeList). **ANIME ONLY** — manga support is paused (re-added
  later). No type dimension is threaded through the store/schema/routes; `media_id` stays a
  bare integer that now holds a **MAL anime ID**.
- **Canonical ID = MAL anime ID.** `Media.id` and every `media_id` become MAL anime IDs.
- **Reset existing data** (pre-launch, no real users): truncate `list_entries`, `comments`,
  `discussion_threads` (cascades `discussion_posts`). Keep `profiles`, `follows`. Necessary
  because the old data is keyed by now-defunct AniList IDs and AniList (the only AniList→MAL
  bridge) is down.
- **Supabase `media_cache` table** (keyed by `mal_id` + `type`), Jikan-on-miss with a shared
  throttle, public read / server-only write. Makes `getMediaByIds` one DB query once warm.
- **Preserve the `Media`/`MediaStub` contract and public fn names/signatures** so the ~20
  UI/consumer files are untouched.

## 3. Data model (Supabase)

### New `media_cache` table

```sql
create table public.media_cache (
  mal_id     integer     not null,
  type       text        not null default 'anime' check (type in ('anime','manga')),
  media      jsonb       not null,            -- the mapped Media object
  fetched_at timestamptz not null default now(),
  primary key (mal_id, type)
);
alter table public.media_cache enable row level security;

-- Catalog is public: anyone (incl. logged-out) may read.
create policy "media_cache readable" on public.media_cache for select using (true);
-- No insert/update/delete policy → writes only via the SECURITY DEFINER RPC below.
```

### Cache upsert RPC (server write path)

```sql
create or replace function public.upsert_media_cache(p_rows jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.media_cache (mal_id, type, media, fetched_at)
  select (r->>'mal_id')::int, coalesce(r->>'type','anime'), r->'media', now()
  from jsonb_array_elements(p_rows) as r
  on conflict (mal_id, type) do update
    set media = excluded.media, fetched_at = excluded.fetched_at;
end; $$;
revoke all on function public.upsert_media_cache(jsonb) from public, anon, authenticated;
grant execute on function public.upsert_media_cache(jsonb) to service_role;
```

- **Write path uses the server (service-role) client**, not the anon client — catalog rows
  must not be forgeable. The RPC is granted to `service_role` only. (This is the first
  server-side privileged write in the app; it needs `SUPABASE_SERVICE_ROLE_KEY` available to
  the server — see §7.)
- Reads use the ordinary anon key under the public-read policy.

### One-time reset (migration step, via Supabase tools)

```sql
truncate public.discussion_threads cascade;  -- cascades discussion_posts
truncate public.comments;
truncate public.list_entries;
```

`profiles` and `follows` are untouched.

## 4. The catalog module — in place under `src/lib/anilist/*`

**Implementation note (deviation from a `catalog/` rename):** to keep all ~57 consumer
imports untouched and low-risk, we keep the existing `@/lib/anilist/*` import paths. `types.ts`
(Media contract, 37 imports) and `relations.ts` (source-agnostic, 3 imports) are unchanged.
`media.ts` (17 imports) keeps its public function names/signatures but its internals are
rewritten to be Jikan+cache-backed; new siblings `jikan.ts` (client), `map.ts` (pure mappers),
`cache.ts` are added under `src/lib/anilist/`; the AniList-only `client.ts` + `queries.ts` are
removed. The directory name becomes a misnomer (now holds Jikan code) — a cosmetic rename to
`catalog/` is a deferred follow-up. Function/type descriptions below apply to these files.

### `client.ts` — `jikanRequest<T>(path, opts)`
GET `https://api.jikan.moe/v4{path}`, `Accept: application/json`, Next `revalidate` cache,
retry on 429/5xx honoring `Retry-After` with backoff, surfaced as a `JikanError` on
exhaustion. All Jikan calls funnel through a **shared throttle** (concurrency + spacing to
stay under ~3 req/s) so batch backfill can't burst past the rate limit.

### `map.ts` — pure mappers (unit-tested vs captured fixtures)
`mapAnime(raw): Media` per the Section-2 field table:
- `id←mal_id`, `type:"ANIME"`, `title←title_english ?? title ?? "Untitled"`,
  `coverImage←images.jpg.large_image_url`, `bannerImage←null`, `description←synopsis`,
  `genres←genres[].name`, `tags←(themes[]+demographics[]) as {id: mal_id, name, rank: 100}`,
  `format←type` via a mapping table (TV→TV, Movie→MOVIE, OVA→OVA, ONA→ONA, Special→SPECIAL,
  Music→MUSIC; unknown→null), `episodes←episodes`, `chapters←null`,
  `averageScore←round(score*10)` (null→null), `popularity←members ?? 0`,
  `seasonYear←year ?? aired.prop.from.year ?? null`,
  `relations←relations[]` (relation name → SEQUEL/PREQUEL/SIDE_STORY/…; each entry → stub
  with `coverImage: null`). Also `mapRecommendationEntry` for `/recommendations` (has images
  → stub cover populated).

### `cache.ts`
- `readCache(supabase, malIds): Promise<Media[]>` — `select media from media_cache where type='anime' and mal_id in (…)`, returns the mapped `Media[]` (parsed jsonb).
- `writeCache(serverSupabase, media[])` — calls `upsert_media_cache` with the rows.

### `catalog.ts` — public API (same signatures as today)
- `getMediaById(id)` — cache-first; miss → `/anime/{id}/full`, map, cache, return (null on 404/fail).
- `getMediaByIds(ids)` — cache query for hits; misses fetched via `/anime/{id}/full` through
  the throttle, mapped, cached, merged; **partial-tolerant** (skip failed misses). Returns
  the found `Media[]` (order not guaranteed — consumers already index by id).
- `searchMedia({search,type,genre,format,seasonYear,sort,page,perPage})` — `type:"MANGA"` →
  `{items:[], hasNextPage:false}`; else `/anime?q=&genres=&order_by=&page=&limit=` → map +
  warm cache; returns `{items, hasNextPage}` from Jikan pagination.
- `getTrending(type, perPage)` — `type:"MANGA"` → `[]`; else `/top/anime?filter=bypopularity` → map + warm cache.
- `getRecommendationsFor(mediaId, perPage)` — `/anime/{mediaId}/recommendations` → stubs.
- `getMediaByMalIds(malIds, type)` — import helper; now a near-identity (MAL IDs are already
  canonical) returning stubs from the cache/Jikan for the requested anime IDs.

Single fetch uses `/anime/{id}/full` (includes relations) so cached rows are complete.

## 5. Consumers & manga handling

- **Unchanged** (same `Media` shape + fn signatures): media detail page, MyListView/MediaList,
  StatsView, RecommendationsView, feed, discussion highlights, home, search — they keep
  importing `Media` and calling the same functions.
- **Manga UI paused:** hide the anime/manga type toggle in Search controls and the home mood
  picker so users can't select an empty manga view; default everything to ANIME. `searchMedia`/
  `getTrending` already return empty for MANGA as a backstop.
- **Import** (`/import`, MAL export): anime entries import directly (MAL IDs are canonical);
  manga rows in the export are skipped for now.
- The banner-less detail hero, coarser rec tag-affinity, and cover-less related-titles row are
  the accepted degradations (Section 2).

## 6. Error handling

- Cache read failure → fall back to live Jikan for that request.
- Jikan miss failure inside `getMediaByIds` → skip that id (partial results); list/stats show
  "unavailable" for the missing entry (existing behavior).
- `getMediaById` miss/404/failure → null → existing not-found/error UI.
- `searchMedia`/`getTrending` failure → throw → existing error/empty states.
- Cache **write** failure is non-fatal — a warm-cache upsert that fails is swallowed (logged);
  the request still returns its Jikan data.
- Throttle ensures a big cold list degrades to "slow then cached", never a 429 storm.

## 7. External setup

- **`SUPABASE_SERVICE_ROLE_KEY`** must be available to the server (Vercel env + `.env.local`)
  for the cache write path (`upsert_media_cache` via a service-role server client). This is
  the one new secret. If absent, the cache still *reads* (anon) and *writes* degrade to no-op
  (catalog still works via live Jikan, just without warming) — so the app never hard-depends
  on it, but warming needs it. The implementation plan documents the exact env steps.
- Claude applies the `media_cache` migration + the reset via the Supabase tools.

## 8. Testing

- **Pure mappers** (`map.ts`) vs captured Jikan JSON fixtures: anime detail, search item,
  top item, recommendation entry — title fallback, score×10, members→popularity, format map,
  themes+demographics→tags, relations, null banner/cover cases.
- **cache.ts / catalog.ts** (mocked client + SupaLike): `getMediaByIds` returns cache hits
  without fetching, fetches+caches misses, tolerates a failing miss (partial), warms cache on
  search/trending; `searchMedia`/`getTrending` return empty for MANGA.
- **client.ts**: retry on 429/5xx, backoff, throttle spacing.
- **media_cache** RLS (public read, no anon write) + `upsert_media_cache` verified against
  the live DB.
- Existing suite stays green (adjust the AniList-specific tests that are being replaced; do
  not weaken behavioral coverage of consumers).

## 9. Explicitly out of scope

- **Manga catalog** (paused; the type dimension + `/media/[type]/[id]` refactor is deferred to
  when manga returns).
- Cache revalidation/TTL/background refresh (serve-as-is for v1; `fetched_at` stored for later).
- Migrating old AniList-ID data (it is reset, not remapped).
- Kitsu/other sources; AniList fallback.
