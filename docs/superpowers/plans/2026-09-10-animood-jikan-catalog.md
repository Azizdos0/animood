# Jikan/MAL Catalog Migration (anime-only) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the disabled AniList catalog with Jikan (MyAnimeList), anime-only, behind a Supabase `media_cache`, preserving the `Media` contract and all fetch-function signatures so UI consumers are untouched.

**Architecture:** Keep `@/lib/anilist/*` import paths. `types.ts` + `relations.ts` unchanged. `media.ts` keeps its public fns but its internals become cache-first + Jikan-backfill; new siblings `jikan.ts` (throttled client), `map.ts` (pure mappers), `cache.ts` (+ a service-role Supabase client) are added; AniList `client.ts`/`queries.ts` removed. A `media_cache` table (public read, service-role write via RPC) makes batch-by-id one DB query.

**Tech Stack:** Next.js 16, TypeScript, Supabase (RLS + a service-role write path), Vitest.

## Global Constraints

- **Node >= 22.4.** Full suite via `npm test` (sets `NODE_OPTIONS=--no-experimental-webstorage`). NEVER run the full suite with bare `npx vitest run`.
- **No new runtime dependencies** (implement the throttle by hand, no p-limit dep).
- **Tests never hit live Jikan** — mock `fetch`/the client; mappers use captured fixtures.
- **Preserve the `Media`/`MediaStub`/`MediaType`/`MediaFormat` contract and the public fn names/signatures** in `@/lib/anilist/media` — consumers must not need edits.
- **Catalog reads use the anon key; cache writes use the service-role client (server-only).** The service-role key must never reach client bundles — `cache.ts`'s write client is imported only by server code (media.ts runs in RSC/route handlers).
- **Anime-only:** `Media.type` is always `"ANIME"`; `searchMedia`/`getTrending` return empty for `type:"MANGA"`; relations are filtered to anime entries.
- `npm run build` exit 0, `npx tsc --noEmit` clean, existing suite green (minus rewritten AniList-specific tests).
- **Commit after every task.**

---

### Task 1: DB — `media_cache` table + `upsert_media_cache` RPC

**Files:** Create `supabase/migrations/0010_media_cache.sql`; apply via the Supabase `apply_migration` tool to project `teerejvdaohbtlrxxcdo`.
(The destructive one-time data RESET — truncating list_entries/comments/discussion_threads — is NOT in this task; it is a deploy step done at merge, see Post-implementation.)

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/0010_media_cache.sql
create table if not exists public.media_cache (
  mal_id     integer     not null,
  type       text        not null default 'anime' check (type in ('anime','manga')),
  media      jsonb       not null,
  fetched_at timestamptz not null default now(),
  primary key (mal_id, type)
);
alter table public.media_cache enable row level security;
drop policy if exists "media_cache readable" on public.media_cache;
create policy "media_cache readable" on public.media_cache for select using (true);

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

- [ ] **Step 2: Apply** via `apply_migration` (name `0010_media_cache`).
- [ ] **Step 3: Verify** via `list_tables` (table + RLS) and `execute_sql`: call `select public.upsert_media_cache('[{"mal_id":1,"type":"anime","media":{"id":1,"title":"Test"}}]'::jsonb);` then `select media->>'title' from media_cache where mal_id=1;` → "Test"; confirm `has_function_privilege('anon','public.upsert_media_cache(jsonb)','execute')` is **false** and anon SELECT on the table is allowed; then `delete from media_cache where mal_id=1;`. Run `get_advisors` (security): no new ERROR (the SECURITY DEFINER WARN for upsert_media_cache is expected/by-design like the other RPCs).
- [ ] **Step 4: Commit** — `git add supabase/migrations/0010_media_cache.sql && git commit -m "feat(db): media_cache table + upsert_media_cache RPC (Jikan catalog cache)"`

---

### Task 2: Jikan client + throttle (`src/lib/anilist/jikan.ts`)

**Files:** Create `src/lib/anilist/jikan.ts`; Test `src/lib/anilist/__tests__/jikan.test.ts`.

**Interfaces:**
- `class JikanError extends Error { status: number }`
- `jikanRequest<T>(path: string, opts?: { revalidateSeconds?: number; maxRetries?: number; signal?: AbortSignal }): Promise<T>` — GET `https://api.jikan.moe/v4${path}`, `Accept: application/json`, `next: { revalidate: revalidateSeconds ?? 86400 }`; retry on 429/5xx honoring `Retry-After` (else exp backoff), throw `JikanError(status)` on exhaustion or non-ok; returns the parsed JSON body (the caller reads `.data`/`.pagination`).
- `throttle<T>(fn: () => Promise<T>): Promise<T>` — routes calls through a shared queue that runs at most `MAX_CONCURRENT` (2) at once with a minimum `MIN_SPACING_MS` (~350ms) between starts, to stay under Jikan's ~3/s. Every `jikanRequest` goes through `throttle` internally.

- [ ] **Step 1: Write failing tests** (mock `global.fetch`): a 200 returns parsed body; a 429 then 200 retries and succeeds (fake timers or injected tiny backoff); exhausted retries throw `JikanError` with the status; two concurrent `jikanRequest` calls do not start simultaneously (throttle spacing — assert via timestamps/`fetch` call ordering with fake timers). Keep assertions real.

```typescript
// sketch — src/lib/anilist/__tests__/jikan.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { jikanRequest, JikanError } from "@/lib/anilist/jikan";
beforeEach(() => vi.restoreAllMocks());
it("returns parsed body on 200", async () => {
  global.fetch = vi.fn(async () => new Response(JSON.stringify({ data: { mal_id: 1 } }), { status: 200 })) as never;
  expect(await jikanRequest<{ data: { mal_id: number } }>("/anime/1")).toEqual({ data: { mal_id: 1 } });
});
it("throws JikanError on repeated 500", async () => {
  global.fetch = vi.fn(async () => new Response("x", { status: 500 })) as never;
  await expect(jikanRequest("/anime/1", { maxRetries: 1 })).rejects.toBeInstanceOf(JikanError);
});
```

- [ ] **Step 2: Run to fail.** `npx vitest run src/lib/anilist/__tests__/jikan.test.ts`
- [ ] **Step 3: Implement** `jikan.ts` per interfaces (hand-rolled throttle: a promise-chain queue + timestamp gate; no deps).
- [ ] **Step 4: Run to pass**, then `npm test`.
- [ ] **Step 5: Commit** — `feat(catalog): throttled Jikan v4 client`

---

### Task 3: Pure mappers (`src/lib/anilist/map.ts`)

**Files:** Create `src/lib/anilist/map.ts`, `src/lib/anilist/__tests__/fixtures/jikan.ts` (captured shapes), `src/lib/anilist/__tests__/map.test.ts`.

**Interfaces (consume `Media`/`MediaStub`/`MediaFormat` from `./types`):**
- `mapAnime(raw: JikanAnime): Media`
- `mapRecommendationEntry(raw): MediaRecommendation` (from `/recommendations` item `{ entry, votes }`)
- `mapSearchItem = mapAnime` (top/search items share the anime shape)
- helpers: `pickTitle`, `mapFormat(type)`, `mapScore(score)`, `mapTags(themes, demographics)`, `mapRelations(relations)`.

Mapping (grounded in a real `/anime/1/full` capture):
- `id←mal_id`; `type:"ANIME"`; `title←title_english ?? title ?? "Untitled"`;
- `coverImage←images.jpg.large_image_url ?? null`; `bannerImage←null`; `description←synopsis ?? null`;
- `genres←(genres ?? []).map(g=>g.name)`;
- `tags←[...(themes??[]), ...(demographics??[])].map(t=>({id:t.mal_id, name:t.name, rank:100}))`;
- `format←mapFormat(type)`: TV→"TV", "TV Special"→"SPECIAL", Movie→"MOVIE", OVA→"OVA", ONA→"ONA", Special→"SPECIAL", Music→"MUSIC", else null;
- `episodes←episodes ?? null`; `chapters←null`;
- `averageScore←score==null?null:Math.round(score*10)`;
- `popularity←members ?? 0`;
- `seasonYear←year ?? aired?.prop?.from?.year ?? null`;
- `relations←(relations??[]).flatMap(r => r.entry.filter(e=>e.type==="anime").map(e => ({ relationType: normalizeRelation(r.relation), node: { id:e.mal_id, title:e.name, coverImage:null, format:null } })))` where `normalizeRelation("Sequel")="SEQUEL"`, `"Prequel"="PREQUEL"`, `"Side story"/"Side Story"="SIDE_STORY"`, `"Parent story"="PARENT"`, `"Alternative version"="ALTERNATIVE"`, else the upper-snake of the name.

- [ ] **Step 1: Write fixtures + failing tests.** Put a representative real capture in `fixtures/jikan.ts`:

```typescript
// fixtures/jikan.ts — trimmed from a real /anime/1/full response
export const COWBOY_BEBOP_FULL = {
  mal_id: 1, title: "Cowboy Bebop", title_english: "Cowboy Bebop", type: "TV",
  episodes: 26, score: 8.75, members: 2071833, popularity: 41, year: 1998,
  synopsis: "Crime is timeless...",
  images: { jpg: { image_url: "s.jpg", small_image_url: "sm.jpg", large_image_url: "lg.jpg" } },
  genres: [{ mal_id: 1, name: "Action" }, { mal_id: 24, name: "Sci-Fi" }],
  themes: [{ mal_id: 50, name: "Adult Cast" }, { mal_id: 29, name: "Space" }],
  demographics: [],
  aired: { prop: { from: { year: 1998 } } },
  relations: [
    { relation: "Adaptation", entry: [{ mal_id: 174, type: "manga", name: "CB manga" }] },
    { relation: "Side Story", entry: [{ mal_id: 5, type: "anime", name: "CB: Tengoku no Tobira" }] },
  ],
};
export const REC_ITEM = { entry: { mal_id: 5, title: "CB Movie", images: { jpg: { large_image_url: "r.jpg" } } }, votes: 42 };
```

Tests assert: title fallback, `averageScore===88` (round 8.75*10), `popularity===2071833`, `format==="TV"`, tags = Adult Cast + Space with `rank:100`, `bannerImage===null`, relations includes ONLY the anime "Side Story" (not the manga adaptation) mapped to `SIDE_STORY` with `coverImage:null`; `mapRecommendationEntry(REC_ITEM)` → `{ mediaId:5, rating:42, media:{ id:5, coverImage:"r.jpg", ... } }`.

- [ ] **Step 2-4:** run to fail, implement `map.ts`, run to pass + `npm test`.
- [ ] **Step 5: Commit** — `feat(catalog): pure Jikan→Media mappers with fixtures`

---

### Task 4: Service-role client + cache (`src/lib/supabase/service.ts`, `src/lib/anilist/cache.ts`)

**Files:** Create `src/lib/supabase/service.ts`, `src/lib/anilist/cache.ts`; Test `src/lib/anilist/__tests__/cache.test.ts`.

**Interfaces:**
- `service.ts`: `isServiceConfigured(): boolean` (URL + `SUPABASE_SERVICE_ROLE_KEY` present); `supabaseService(): SupabaseClient` — `createClient(url, serviceKey, { auth: { persistSession:false } })`, cached; throws if not configured. **Server-only.**
- `cache.ts`:
  - `readCache(supabase: SupaLike, malIds: number[]): Promise<Media[]>` — `from("media_cache").select("media").eq("type","anime").in("mal_id", malIds)`; returns `rows.map(r => r.media as Media)`; `[]` on empty/`malIds` empty.
  - `writeCache(media: Media[]): Promise<void>` — if `!isServiceConfigured()` return (no-op); else `supabaseService().rpc("upsert_media_cache", { p_rows: media.map(m => ({ mal_id: m.id, type: "anime", media: m })) })`; **swallow errors** (warm-cache write is non-fatal — log via console.warn).

- [ ] **Step 1: Write failing tests** (mock `@/lib/supabase/service` + a fake SupaLike): `readCache` maps rows→Media and returns [] for []; `writeCache` no-ops when `isServiceConfigured()` is false (rpc not called) and calls `rpc("upsert_media_cache", {p_rows:[...]})` with correct shape when configured; a throwing rpc is swallowed (resolves, doesn't reject).
- [ ] **Step 2-4:** fail, implement, pass + `npm test` + `npx tsc --noEmit`.
- [ ] **Step 5: Commit** — `feat(catalog): media_cache read/write + service-role client`

---

### Task 5: Rewrite `media.ts` public API (cache-first + Jikan) & retire AniList internals

**Files:** Rewrite `src/lib/anilist/media.ts`; create `src/lib/anilist/genres.ts` (static genre name→Jikan-id map); delete `src/lib/anilist/client.ts` + `src/lib/anilist/queries.ts`; update/replace their tests (`__tests__/client.test.ts`, `media.test.ts`, `media-by-ids.test.ts`, `media-by-mal-ids.test.ts`) to the Jikan-backed behavior; `relations.ts`/`types.ts` + their tests unchanged.

**`genres.ts`** — a static `GENRE_IDS: Record<string, number>` captured from Jikan `/genres/anime` (stable list), used to translate our genre names → Jikan genre IDs for real filtering:

```typescript
// src/lib/anilist/genres.ts
export const GENRE_IDS: Record<string, number> = {"Action": 1, "Adult Cast": 50, "Adventure": 2, "Anthropomorphic": 51, "Avant Garde": 5, "Award Winning": 46, "Boys Love": 28, "CGDCT": 52, "Childcare": 53, "Combat Sports": 54, "Comedy": 4, "Crossdressing": 81, "Delinquents": 55, "Detective": 39, "Drama": 8, "Ecchi": 9, "Educational": 56, "Erotica": 49, "Fantasy": 10, "Gag Humor": 57, "Girls Love": 26, "Gore": 58, "Gourmet": 47, "Harem": 35, "Hentai": 12, "High Stakes Game": 59, "Historical": 13, "Horror": 14, "Idols (Female)": 60, "Idols (Male)": 61, "Isekai": 62, "Iyashikei": 63, "Josei": 43, "Kids": 15, "Love Polygon": 64, "Love Status Quo": 74, "Magical Sex Shift": 65, "Mahou Shoujo": 66, "Martial Arts": 17, "Mecha": 18, "Medical": 67, "Military": 38, "Music": 19, "Mystery": 7, "Mythology": 6, "Organized Crime": 68, "Otaku Culture": 69, "Parody": 20, "Performing Arts": 70, "Pets": 71, "Psychological": 40, "Racing": 3, "Reincarnation": 72, "Reverse Harem": 73, "Romance": 22, "Samurai": 21, "School": 23, "Sci-Fi": 24, "Seinen": 42, "Shoujo": 25, "Shounen": 27, "Showbiz": 75, "Slice of Life": 36, "Space": 29, "Sports": 30, "Strategy Game": 11, "Super Power": 31, "Supernatural": 37, "Survival": 76, "Suspense": 41, "Team Sports": 77, "Time Travel": 78, "Urban Fantasy": 82, "Vampire": 32, "Video Game": 79, "Villainess": 83, "Visual Arts": 80, "Workplace": 48};
export const genreId = (name?: string): number | undefined => name ? GENRE_IDS[name] : undefined;
```

**Interfaces (SAME signatures as today):** consumes `jikanRequest` (Task 2), `mapAnime`/`mapRecommendationEntry` (Task 3), `readCache`/`writeCache` (Task 4), `supabaseServer` (anon read).
- `getMediaById(id)` — `readCache(anon,[id])` hit → return; miss → `jikanRequest("/anime/{id}/full")`, `mapAnime`, `writeCache([m])`, return; null on 404/JikanError.
- `getMediaByIds(ids)` — `readCache(anon, ids)` → hits; for misses, `throttle`d `/anime/{id}/full` each, map, collect; `writeCache(newlyFetched)`; return `[...hits, ...fetched]`; **skip** a miss whose fetch throws (partial-tolerant).
- `searchMedia({search,type,genre,format,seasonYear,sort,page,perPage})` — `type==="MANGA"` → `{items:[],hasNextPage:false}`; else build `/anime?` query: `q←search`, `genres←genreId(genre)` (from `genres.ts`; omit if unknown), `order_by`+`sort` mapped from our `sort` (POPULARITY_DESC→`order_by=members&sort=desc`, SCORE_DESC→`order_by=score&sort=desc`, default `order_by=members&sort=desc`), `page`, `limit←perPage`; `jikanRequest`, map items, `writeCache(items)` (best-effort), return `{ items, hasNextPage: body.pagination.has_next_page }`.
- `getTrending(type, perPage)` — MANGA → `[]`; else `jikanRequest("/top/anime?filter=bypopularity&limit={perPage}")`, map, `writeCache`, return.
- `getRecommendationsFor(mediaId, perPage)` — `jikanRequest("/anime/{mediaId}/recommendations")`, map entries (slice to perPage), return `MediaRecommendation[]`; `[]` on failure.
- `getMediaByMalIds(malIds, type)` — MANGA → `[]`; else fetch via `getMediaByIds(malIds)` and return `MalMediaStub[]` (`{id, idMal:id, title, coverImage, format}`) — MAL IDs are already canonical.

Reads use `supabaseServer()` (anon) for cache; all these run server-side (RSC/route handlers) so the service-role write client stays server-only. Wrap cache read in try/catch → fall back to live Jikan on cache error.

- [ ] **Step 1: Write failing tests** — new `media.test.ts` (mock `./jikan`, `./cache`, `./map` or the underlying fetch + cache): `getMediaByIds` returns cache hits WITHOUT calling jikan, fetches+writes misses, tolerates a throwing miss (returns the rest); `getMediaById` returns null on JikanError; `searchMedia` returns empty for MANGA; `getRecommendationsFor` maps entries. Delete AniList `client.test.ts`/`media-by-ids.test.ts`/`media-by-mal-ids.test.ts` (AniList-specific) — replace their coverage with the new behavior tests. Keep `relations.test.ts`, `types.test.ts`.
- [ ] **Step 2: Run to fail.**
- [ ] **Step 3: Implement** the rewrite; delete `client.ts` + `queries.ts`. Ensure no remaining import of the deleted files (grep).
- [ ] **Step 4: Run to pass** — `npm test` (full suite green), `npx tsc --noEmit`, `npm run build` exit 0.
- [ ] **Step 5: Commit** — `feat(catalog): Jikan+cache-backed media API; remove AniList client/queries`

---

### Task 6: Pause manga in the UI

**Files:** Modify `src/components/SearchControls.tsx`, `src/components/home/MoodPicker.tsx` (and `src/components/discovery/MoodChoices.tsx` if it exposes a type toggle); `src/lib/import/mal.ts` (skip manga rows) or its route; update affected tests.

**Behavior:** hide/remove the anime↔manga type selector; default `type` to `"ANIME"` everywhere it was user-selectable. Any lingering `type=MANGA` request is already a safe empty via Task 5. Import: filter the MAL export to anime entries only (drop manga), so `/import` doesn't create manga list entries.

- [ ] **Step 1: Write/adjust failing tests** — SearchControls no longer renders a manga option (assert the toggle/option is absent or the control defaults to anime); import parser/route drops manga rows (a fixture with mixed types yields anime-only). Match existing test style; do not weaken other assertions.
- [ ] **Step 2-4:** fail, implement, `npm test` + `npx tsc --noEmit` + `npm run build`.
- [ ] **Step 5: Commit** — `feat(catalog): pause manga in search/home/import (anime-only)`

---

## Post-implementation verification (whole feature)

- [ ] `npm test` green; `npx tsc --noEmit` clean; `npm run build` exit 0 (all routes compile).
- [ ] media_cache RLS/RPC verified (Task 1).
- [ ] **DESTRUCTIVE deploy step (do at merge, flag explicitly):** run the one-time reset on the live DB — `truncate public.discussion_threads cascade; truncate public.comments; truncate public.list_entries;` (keeps profiles/follows). This is irreversible; only after the migration is merging to production.
- [ ] **User env step:** add `SUPABASE_SERVICE_ROLE_KEY` to Vercel (+ `.env.local`) so the cache warms; without it the app still works via live Jikan (slower, uncached).
- [ ] Live smoke test post-deploy: home trending loads (real Jikan data), search works, a media page renders, adding to list + Stats resolve titles from cache.

## Deferred

- Manga catalog + the type-dimension refactor; cache TTL/revalidation; AniList-ID data remap; renaming `anilist/`→`catalog/`. (Genre-filtered search IS supported in v1 via the static `genres.ts` map.)
