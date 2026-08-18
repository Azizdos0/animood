# Animood Phase 1 — Foundation & Data Layers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the Animood Next.js project and build the two data layers everything else depends on: a cached AniList GraphQL client and a versioned localStorage list store.

**Architecture:** Next.js (App Router) + TypeScript app. A server-side AniList data layer (`lib/anilist/*`) fetches and caches anime/manga data from the AniList GraphQL API. A client-side list store (`lib/list/*`) persists the user's personal list in `localStorage` behind a validated, versioned schema. Both layers are pure/framework-light and unit-tested against mocks so no test hits the network or a real browser.

**Tech Stack:** Next.js 14+ (App Router), TypeScript, Tailwind CSS, Vitest + jsdom for tests, AniList GraphQL API (`https://graphql.anilist.co`).

## Global Constraints

- Language: TypeScript, `strict` mode on.
- Node: 18.18+ (Next.js 14 floor).
- No user accounts, no server database, no social features in Phase 1.
- localStorage persists the user's list ONLY, keyed by AniList media id, behind schema `version: 1`.
- AniList score scale surfaced to the user is **1–10** (`score: number | null`, null = unrated).
- Tests must never hit the real AniList API — mock `fetch`.
- Import alias: `@/*` maps to the project `src/` root.

---

### Task 1: Project scaffolding & test harness

**Files:**
- Create: whole Next.js app in repo root (`package.json`, `tsconfig.json`, `src/app/*`, `tailwind.config.ts`, etc.)
- Create: `vitest.config.ts`
- Create: `vitest.setup.ts`
- Create: `src/lib/__tests__/smoke.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: a working dev app (`npm run dev`) and a working test runner (`npm test`) usable by all later tasks. Import alias `@/` → `src/`.

- [ ] **Step 1: Scaffold the Next.js app into the repo root**

The repo already contains `docs/` and `.git/`. Scaffold in place:

```bash
npx create-next-app@latest . --typescript --tailwind --app --eslint --src-dir --import-alias "@/*" --use-npm --no-turbopack
```

If prompted about a non-empty directory, choose to continue (it preserves `docs/` and `.git/`). If it hard-refuses, scaffold into a temp dir and move files into the repo root.

- [ ] **Step 2: Add test dependencies**

```bash
npm install -D vitest @vitejs/plugin-react jsdom @testing-library/react @testing-library/jest-dom @testing-library/user-event
```

- [ ] **Step 3: Create `vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    globals: true,
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
```

- [ ] **Step 4: Create `vitest.setup.ts`**

```ts
import "@testing-library/jest-dom/vitest";
```

- [ ] **Step 5: Add the test script to `package.json`**

Add to the `"scripts"` block:

```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 6: Write a smoke test at `src/lib/__tests__/smoke.test.ts`**

```ts
import { describe, it, expect } from "vitest";

describe("test harness", () => {
  it("runs", () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 7: Run the smoke test**

Run: `npm test`
Expected: PASS, 1 test.

- [ ] **Step 8: Verify the dev server boots**

Run: `npm run build`
Expected: build completes with no type errors.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "chore: scaffold Next.js app and Vitest harness"
```

---

### Task 2: AniList domain types

**Files:**
- Create: `src/lib/anilist/types.ts`
- Test: `src/lib/anilist/__tests__/types.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `type MediaType = "ANIME" | "MANGA"`
  - `type MediaFormat = "TV" | "TV_SHORT" | "MOVIE" | "SPECIAL" | "OVA" | "ONA" | "MUSIC" | "MANGA" | "NOVEL" | "ONE_SHOT"`
  - `interface MediaTag { id: number; name: string; rank: number }`  // rank is 0–100
  - `interface MediaRelationEdge { relationType: string; node: MediaStub }`
  - `interface MediaStub { id: number; title: string; coverImage: string | null; format: MediaFormat | null }`
  - `interface Media { id: number; type: MediaType; title: string; coverImage: string | null; bannerImage: string | null; description: string | null; genres: string[]; tags: MediaTag[]; format: MediaFormat | null; episodes: number | null; chapters: number | null; averageScore: number | null; popularity: number; seasonYear: number | null; relations: MediaRelationEdge[] }`
  - `interface MediaRecommendation { mediaId: number; rating: number; media: MediaStub }`

- [ ] **Step 1: Write the failing test at `src/lib/anilist/__tests__/types.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import type { Media, MediaTag } from "@/lib/anilist/types";
import { isAnime } from "@/lib/anilist/types";

describe("anilist types", () => {
  it("exposes an isAnime type guard", () => {
    const tag: MediaTag = { id: 1, name: "Psychological", rank: 90 };
    const media: Media = {
      id: 1, type: "ANIME", title: "Test", coverImage: null, bannerImage: null,
      description: null, genres: ["Drama"], tags: [tag], format: "TV",
      episodes: 12, chapters: null, averageScore: 80, popularity: 1000,
      seasonYear: 2020, relations: [],
    };
    expect(isAnime(media)).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- types`
Expected: FAIL — cannot find module `@/lib/anilist/types`.

- [ ] **Step 3: Implement `src/lib/anilist/types.ts`**

```ts
export type MediaType = "ANIME" | "MANGA";

export type MediaFormat =
  | "TV" | "TV_SHORT" | "MOVIE" | "SPECIAL" | "OVA" | "ONA"
  | "MUSIC" | "MANGA" | "NOVEL" | "ONE_SHOT";

export interface MediaTag {
  id: number;
  name: string;
  rank: number; // 0–100
}

export interface MediaStub {
  id: number;
  title: string;
  coverImage: string | null;
  format: MediaFormat | null;
}

export interface MediaRelationEdge {
  relationType: string; // e.g. "SEQUEL", "PREQUEL", "SIDE_STORY"
  node: MediaStub;
}

export interface Media {
  id: number;
  type: MediaType;
  title: string;
  coverImage: string | null;
  bannerImage: string | null;
  description: string | null;
  genres: string[];
  tags: MediaTag[];
  format: MediaFormat | null;
  episodes: number | null;
  chapters: number | null;
  averageScore: number | null; // 0–100 from AniList
  popularity: number;
  seasonYear: number | null;
  relations: MediaRelationEdge[];
}

export interface MediaRecommendation {
  mediaId: number;
  rating: number; // community recommendation vote strength
  media: MediaStub;
}

export function isAnime(media: Media): boolean {
  return media.type === "ANIME";
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- types`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/anilist/types.ts src/lib/anilist/__tests__/types.test.ts
git commit -m "feat: add AniList domain types"
```

---

### Task 3: Low-level AniList request client (with retry/backoff)

**Files:**
- Create: `src/lib/anilist/client.ts`
- Test: `src/lib/anilist/__tests__/client.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `class AniListError extends Error { status: number }`
  - `async function anilistRequest<T>(query: string, variables?: Record<string, unknown>, opts?: { revalidateSeconds?: number; maxRetries?: number }): Promise<T>`
  - Endpoint constant `ANILIST_ENDPOINT = "https://graphql.anilist.co"`.
  - Behavior: POSTs `{ query, variables }`; on HTTP 429 or 5xx retries up to `maxRetries` (default 2) with exponential backoff honoring a `Retry-After` header when present; throws `AniListError` on final failure or GraphQL `errors`.

- [ ] **Step 1: Write failing tests at `src/lib/anilist/__tests__/client.test.ts`**

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { anilistRequest, AniListError } from "@/lib/anilist/client";

function mockFetchOnce(status: number, body: unknown, headers: Record<string, string> = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (k: string) => headers[k.toLowerCase()] ?? null },
    json: async () => body,
  } as unknown as Response;
}

describe("anilistRequest", () => {
  beforeEach(() => { vi.restoreAllMocks(); });
  afterEach(() => { vi.restoreAllMocks(); });

  it("returns the data payload on success", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      mockFetchOnce(200, { data: { Media: { id: 5 } } })
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await anilistRequest<{ Media: { id: number } }>("query {}", {});
    expect(result.Media.id).toBe(5);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retries on 429 then succeeds", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(mockFetchOnce(429, {}, { "retry-after": "0" }))
      .mockResolvedValueOnce(mockFetchOnce(200, { data: { ok: true } }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await anilistRequest<{ ok: boolean }>("q", {}, { maxRetries: 2 });
    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("throws AniListError after exhausting retries", async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockFetchOnce(500, {}));
    vi.stubGlobal("fetch", fetchMock);

    await expect(anilistRequest("q", {}, { maxRetries: 1 })).rejects.toBeInstanceOf(AniListError);
  });

  it("throws AniListError when the GraphQL response contains errors", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      mockFetchOnce(200, { errors: [{ message: "bad query" }] })
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(anilistRequest("q", {})).rejects.toThrow("bad query");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- client`
Expected: FAIL — cannot find module `@/lib/anilist/client`.

- [ ] **Step 3: Implement `src/lib/anilist/client.ts`**

```ts
export const ANILIST_ENDPOINT = "https://graphql.anilist.co";

export class AniListError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "AniListError";
    this.status = status;
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface RequestOpts {
  revalidateSeconds?: number;
  maxRetries?: number;
}

export async function anilistRequest<T>(
  query: string,
  variables: Record<string, unknown> = {},
  opts: RequestOpts = {}
): Promise<T> {
  const { revalidateSeconds = 3600, maxRetries = 2 } = opts;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const res = await fetch(ANILIST_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ query, variables }),
      // Next.js server-side cache; ignored in test/jsdom.
      next: { revalidate: revalidateSeconds },
    } as RequestInit);

    if (res.status === 429 || res.status >= 500) {
      if (attempt === maxRetries) {
        throw new AniListError(`AniList request failed (${res.status})`, res.status);
      }
      const retryAfter = Number(res.headers.get("retry-after"));
      const backoff = Number.isFinite(retryAfter) && retryAfter > 0
        ? retryAfter * 1000
        : 2 ** attempt * 500;
      await sleep(backoff);
      continue;
    }

    const json = (await res.json()) as { data?: T; errors?: { message: string }[] };
    if (json.errors && json.errors.length > 0) {
      throw new AniListError(json.errors.map((e) => e.message).join("; "), res.status);
    }
    if (!res.ok || !json.data) {
      throw new AniListError(`AniList request failed (${res.status})`, res.status);
    }
    return json.data;
  }

  throw new AniListError("AniList request failed (retries exhausted)", 0);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- client`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/anilist/client.ts src/lib/anilist/__tests__/client.test.ts
git commit -m "feat: add AniList request client with retry/backoff"
```

---

### Task 4: AniList queries & mappers (search, byId, trending, recommendations)

**Files:**
- Create: `src/lib/anilist/queries.ts` (GraphQL query strings)
- Create: `src/lib/anilist/media.ts` (typed functions + raw→domain mappers)
- Test: `src/lib/anilist/__tests__/media.test.ts`

**Interfaces:**
- Consumes: `anilistRequest` (Task 3), domain types (Task 2).
- Produces:
  - `function mapMedia(raw: RawMedia): Media` — pure mapper, exported for testing.
  - `async function searchMedia(params: { search?: string; type: MediaType; genre?: string; format?: MediaFormat; seasonYear?: number; sort?: string; page?: number; perPage?: number }): Promise<{ items: Media[]; hasNextPage: boolean }>`
  - `async function getMediaById(id: number): Promise<Media | null>`
  - `async function getTrending(type: MediaType, perPage?: number): Promise<Media[]>`
  - `async function getRecommendationsFor(mediaId: number): Promise<MediaRecommendation[]>`
  - `interface RawMedia` describing the AniList JSON shape consumed by `mapMedia`.

- [ ] **Step 1: Create `src/lib/anilist/queries.ts`**

```ts
export const MEDIA_FIELDS = `
  id
  type
  title { romaji english native }
  coverImage { large }
  bannerImage
  description(asHtml: false)
  genres
  tags { id name rank }
  format
  episodes
  chapters
  averageScore
  popularity
  seasonYear
  relations {
    edges {
      relationType
      node { id title { romaji english } coverImage { large } format }
    }
  }
`;

export const SEARCH_QUERY = `
  query Search($search: String, $type: MediaType, $genre: String, $format: MediaFormat,
               $seasonYear: Int, $sort: [MediaSort], $page: Int, $perPage: Int) {
    Page(page: $page, perPage: $perPage) {
      pageInfo { hasNextPage }
      media(search: $search, type: $type, genre: $genre, format: $format,
            seasonYear: $seasonYear, sort: $sort, isAdult: false) {
        ${MEDIA_FIELDS}
      }
    }
  }
`;

export const MEDIA_BY_ID_QUERY = `
  query MediaById($id: Int) {
    Media(id: $id) { ${MEDIA_FIELDS} }
  }
`;

export const TRENDING_QUERY = `
  query Trending($type: MediaType, $perPage: Int) {
    Page(page: 1, perPage: $perPage) {
      media(type: $type, sort: TRENDING_DESC, isAdult: false) {
        ${MEDIA_FIELDS}
      }
    }
  }
`;

export const RECOMMENDATIONS_QUERY = `
  query Recs($mediaId: Int, $perPage: Int) {
    Media(id: $mediaId) {
      recommendations(sort: RATING_DESC, perPage: $perPage) {
        nodes {
          rating
          mediaRecommendation {
            id title { romaji english } coverImage { large } format
          }
        }
      }
    }
  }
`;
```

- [ ] **Step 2: Write failing tests at `src/lib/anilist/__tests__/media.test.ts`**

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { mapMedia, searchMedia, getMediaById } from "@/lib/anilist/media";

const rawMedia = {
  id: 1, type: "ANIME",
  title: { romaji: "Steins;Gate", english: "Steins;Gate", native: null },
  coverImage: { large: "cover.jpg" },
  bannerImage: "banner.jpg",
  description: "A story.",
  genres: ["Sci-Fi", "Thriller"],
  tags: [{ id: 10, name: "Time Travel", rank: 95 }],
  format: "TV", episodes: 24, chapters: null,
  averageScore: 91, popularity: 500000, seasonYear: 2011,
  relations: { edges: [
    { relationType: "SEQUEL",
      node: { id: 2, title: { romaji: "S;G 0", english: null },
              coverImage: { large: "c2.jpg" }, format: "TV" } },
  ] },
};

describe("mapMedia", () => {
  it("maps raw AniList media into the domain shape", () => {
    const m = mapMedia(rawMedia as never);
    expect(m.id).toBe(1);
    expect(m.title).toBe("Steins;Gate");
    expect(m.coverImage).toBe("cover.jpg");
    expect(m.tags[0]).toEqual({ id: 10, name: "Time Travel", rank: 95 });
    expect(m.relations[0].relationType).toBe("SEQUEL");
    expect(m.relations[0].node.id).toBe(2);
  });

  it("prefers english title, falls back to romaji", () => {
    const noEnglish = { ...rawMedia, title: { romaji: "R", english: null, native: null } };
    expect(mapMedia(noEnglish as never).title).toBe("R");
  });
});

describe("searchMedia", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("returns mapped items and pagination", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true, status: 200, headers: { get: () => null },
      json: async () => ({ data: { Page: {
        pageInfo: { hasNextPage: true }, media: [rawMedia],
      } } }),
    } as unknown as Response);
    vi.stubGlobal("fetch", fetchMock);

    const res = await searchMedia({ search: "gate", type: "ANIME" });
    expect(res.items).toHaveLength(1);
    expect(res.items[0].title).toBe("Steins;Gate");
    expect(res.hasNextPage).toBe(true);
  });
});

describe("getMediaById", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("returns null when AniList has no Media", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true, status: 200, headers: { get: () => null },
      json: async () => ({ data: { Media: null } }),
    } as unknown as Response);
    vi.stubGlobal("fetch", fetchMock);

    expect(await getMediaById(999)).toBeNull();
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npm test -- media`
Expected: FAIL — cannot find module `@/lib/anilist/media`.

- [ ] **Step 4: Implement `src/lib/anilist/media.ts`**

```ts
import { anilistRequest } from "./client";
import {
  MEDIA_BY_ID_QUERY, RECOMMENDATIONS_QUERY, SEARCH_QUERY, TRENDING_QUERY,
} from "./queries";
import type {
  Media, MediaFormat, MediaRecommendation, MediaStub, MediaType,
} from "./types";

interface RawTitle { romaji: string | null; english: string | null; native?: string | null }
interface RawStub {
  id: number; title: RawTitle; coverImage: { large: string | null } | null;
  format: MediaFormat | null;
}
export interface RawMedia extends RawStub {
  type: MediaType;
  bannerImage: string | null;
  description: string | null;
  genres: string[];
  tags: { id: number; name: string; rank: number }[];
  episodes: number | null;
  chapters: number | null;
  averageScore: number | null;
  popularity: number;
  seasonYear: number | null;
  relations: { edges: { relationType: string; node: RawStub }[] };
}

const pickTitle = (t: RawTitle): string => t.english ?? t.romaji ?? t.native ?? "Untitled";
const mapStub = (s: RawStub): MediaStub => ({
  id: s.id, title: pickTitle(s.title),
  coverImage: s.coverImage?.large ?? null, format: s.format,
});

export function mapMedia(raw: RawMedia): Media {
  return {
    id: raw.id,
    type: raw.type,
    title: pickTitle(raw.title),
    coverImage: raw.coverImage?.large ?? null,
    bannerImage: raw.bannerImage,
    description: raw.description,
    genres: raw.genres ?? [],
    tags: (raw.tags ?? []).map((t) => ({ id: t.id, name: t.name, rank: t.rank })),
    format: raw.format,
    episodes: raw.episodes,
    chapters: raw.chapters,
    averageScore: raw.averageScore,
    popularity: raw.popularity ?? 0,
    seasonYear: raw.seasonYear,
    relations: (raw.relations?.edges ?? []).map((e) => ({
      relationType: e.relationType, node: mapStub(e.node),
    })),
  };
}

export async function searchMedia(params: {
  search?: string; type: MediaType; genre?: string; format?: MediaFormat;
  seasonYear?: number; sort?: string; page?: number; perPage?: number;
}): Promise<{ items: Media[]; hasNextPage: boolean }> {
  const data = await anilistRequest<{
    Page: { pageInfo: { hasNextPage: boolean }; media: RawMedia[] };
  }>(SEARCH_QUERY, {
    search: params.search || undefined,
    type: params.type,
    genre: params.genre || undefined,
    format: params.format || undefined,
    seasonYear: params.seasonYear || undefined,
    sort: params.sort ? [params.sort] : ["POPULARITY_DESC"],
    page: params.page ?? 1,
    perPage: params.perPage ?? 24,
  });
  return {
    items: data.Page.media.map(mapMedia),
    hasNextPage: data.Page.pageInfo.hasNextPage,
  };
}

export async function getMediaById(id: number): Promise<Media | null> {
  const data = await anilistRequest<{ Media: RawMedia | null }>(MEDIA_BY_ID_QUERY, { id });
  return data.Media ? mapMedia(data.Media) : null;
}

export async function getTrending(type: MediaType, perPage = 20): Promise<Media[]> {
  const data = await anilistRequest<{ Page: { media: RawMedia[] } }>(
    TRENDING_QUERY, { type, perPage }
  );
  return data.Page.media.map(mapMedia);
}

export async function getRecommendationsFor(
  mediaId: number, perPage = 25
): Promise<MediaRecommendation[]> {
  const data = await anilistRequest<{
    Media: { recommendations: { nodes: {
      rating: number; mediaRecommendation: RawStub | null;
    }[] } } | null;
  }>(RECOMMENDATIONS_QUERY, { mediaId, perPage });

  const nodes = data.Media?.recommendations.nodes ?? [];
  return nodes
    .filter((n) => n.mediaRecommendation !== null)
    .map((n) => ({
      mediaId: n.mediaRecommendation!.id,
      rating: n.rating,
      media: mapStub(n.mediaRecommendation!),
    }));
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test -- media`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/anilist/queries.ts src/lib/anilist/media.ts src/lib/anilist/__tests__/media.test.ts
git commit -m "feat: add AniList queries and typed media functions"
```

---

### Task 5: List store schema & validation

**Files:**
- Create: `src/lib/list/schema.ts`
- Test: `src/lib/list/__tests__/schema.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `type ListStatus = "watching" | "completed" | "planning" | "dropped" | "onhold"`
  - `const LIST_STATUSES: ListStatus[]`
  - `interface ListEntry { status: ListStatus; score: number | null; progress: number; updatedAt: string }`
  - `interface ListStoreV1 { version: 1; entries: Record<number, ListEntry> }`
  - `const CURRENT_LIST_VERSION = 1`
  - `function emptyStore(): ListStoreV1`
  - `function isValidStore(value: unknown): value is ListStoreV1` — strict structural validation used to reject corrupt localStorage data.

- [ ] **Step 1: Write failing tests at `src/lib/list/__tests__/schema.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { emptyStore, isValidStore, CURRENT_LIST_VERSION } from "@/lib/list/schema";

describe("list schema", () => {
  it("emptyStore has the current version and no entries", () => {
    const s = emptyStore();
    expect(s.version).toBe(CURRENT_LIST_VERSION);
    expect(s.entries).toEqual({});
  });

  it("accepts a well-formed store", () => {
    const good = { version: 1, entries: {
      5: { status: "completed", score: 9, progress: 24, updatedAt: "2026-01-01T00:00:00.000Z" },
    } };
    expect(isValidStore(good)).toBe(true);
  });

  it("rejects a wrong version", () => {
    expect(isValidStore({ version: 2, entries: {} })).toBe(false);
  });

  it("rejects an entry with an invalid status", () => {
    const bad = { version: 1, entries: {
      5: { status: "watchinggg", score: 9, progress: 0, updatedAt: "x" },
    } };
    expect(isValidStore(bad)).toBe(false);
  });

  it("rejects an out-of-range score", () => {
    const bad = { version: 1, entries: {
      5: { status: "completed", score: 42, progress: 0, updatedAt: "x" },
    } };
    expect(isValidStore(bad)).toBe(false);
  });

  it("rejects non-object input", () => {
    expect(isValidStore(null)).toBe(false);
    expect(isValidStore("nope")).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- schema`
Expected: FAIL — cannot find module `@/lib/list/schema`.

- [ ] **Step 3: Implement `src/lib/list/schema.ts`**

```ts
export type ListStatus =
  | "watching" | "completed" | "planning" | "dropped" | "onhold";

export const LIST_STATUSES: ListStatus[] = [
  "watching", "completed", "planning", "dropped", "onhold",
];

export const CURRENT_LIST_VERSION = 1 as const;

export interface ListEntry {
  status: ListStatus;
  score: number | null; // 1–10 or null
  progress: number;      // >= 0
  updatedAt: string;     // ISO timestamp
}

export interface ListStoreV1 {
  version: 1;
  entries: Record<number, ListEntry>;
}

export function emptyStore(): ListStoreV1 {
  return { version: CURRENT_LIST_VERSION, entries: {} };
}

function isValidEntry(value: unknown): value is ListEntry {
  if (typeof value !== "object" || value === null) return false;
  const e = value as Record<string, unknown>;
  if (!LIST_STATUSES.includes(e.status as ListStatus)) return false;
  if (e.score !== null && (typeof e.score !== "number" || e.score < 1 || e.score > 10)) {
    return false;
  }
  if (typeof e.progress !== "number" || e.progress < 0) return false;
  if (typeof e.updatedAt !== "string") return false;
  return true;
}

export function isValidStore(value: unknown): value is ListStoreV1 {
  if (typeof value !== "object" || value === null) return false;
  const s = value as Record<string, unknown>;
  if (s.version !== CURRENT_LIST_VERSION) return false;
  if (typeof s.entries !== "object" || s.entries === null) return false;
  return Object.values(s.entries as Record<string, unknown>).every(isValidEntry);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- schema`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/list/schema.ts src/lib/list/__tests__/schema.test.ts
git commit -m "feat: add versioned list store schema and validation"
```

---

### Task 6: List store CRUD (localStorage-backed, SSR-safe)

**Files:**
- Create: `src/lib/list/storage.ts`
- Test: `src/lib/list/__tests__/storage.test.ts`

**Interfaces:**
- Consumes: schema module (Task 5).
- Produces:
  - `const LIST_STORAGE_KEY = "animood.list.v1"`
  - `function loadStore(): ListStoreV1` — reads + validates localStorage; returns `emptyStore()` on missing/corrupt/SSR.
  - `function saveStore(store: ListStoreV1): void` — no-op when `window` is undefined.
  - `function getEntry(mediaId: number): ListEntry | null`
  - `function upsertEntry(mediaId: number, patch: Partial<Omit<ListEntry, "updatedAt">>): ListStoreV1` — merges patch, stamps `updatedAt`, persists, returns the new store.
  - `function removeEntry(mediaId: number): ListStoreV1`
  - `function clearAll(): void`

- [ ] **Step 1: Write failing tests at `src/lib/list/__tests__/storage.test.ts`**

```ts
import { describe, it, expect, beforeEach } from "vitest";
import {
  LIST_STORAGE_KEY, loadStore, getEntry, upsertEntry, removeEntry, clearAll,
} from "@/lib/list/storage";

describe("list storage", () => {
  beforeEach(() => { localStorage.clear(); });

  it("loadStore returns an empty store when nothing is saved", () => {
    expect(loadStore().entries).toEqual({});
  });

  it("loadStore returns an empty store when saved data is corrupt", () => {
    localStorage.setItem(LIST_STORAGE_KEY, "{ not json");
    expect(loadStore().entries).toEqual({});
  });

  it("loadStore discards data that fails validation", () => {
    localStorage.setItem(LIST_STORAGE_KEY, JSON.stringify({ version: 99, entries: {} }));
    expect(loadStore().version).toBe(1);
  });

  it("upsertEntry creates then updates an entry and stamps updatedAt", () => {
    upsertEntry(5, { status: "watching", score: null, progress: 3 });
    let e = getEntry(5)!;
    expect(e.status).toBe("watching");
    expect(e.progress).toBe(3);
    expect(typeof e.updatedAt).toBe("string");

    upsertEntry(5, { status: "completed", score: 9 });
    e = getEntry(5)!;
    expect(e.status).toBe("completed");
    expect(e.score).toBe(9);
    expect(e.progress).toBe(3); // preserved
  });

  it("removeEntry deletes an entry", () => {
    upsertEntry(5, { status: "planning" });
    expect(getEntry(5)).not.toBeNull();
    removeEntry(5);
    expect(getEntry(5)).toBeNull();
  });

  it("clearAll empties the store", () => {
    upsertEntry(5, { status: "planning" });
    clearAll();
    expect(loadStore().entries).toEqual({});
  });

  it("persists across a fresh load", () => {
    upsertEntry(7, { status: "completed", score: 8, progress: 12 });
    expect(loadStore().entries[7].score).toBe(8);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- storage`
Expected: FAIL — cannot find module `@/lib/list/storage`.

- [ ] **Step 3: Implement `src/lib/list/storage.ts`**

```ts
import {
  emptyStore, isValidStore, type ListEntry, type ListStoreV1,
} from "./schema";

export const LIST_STORAGE_KEY = "animood.list.v1";

const hasWindow = (): boolean => typeof window !== "undefined";

export function loadStore(): ListStoreV1 {
  if (!hasWindow()) return emptyStore();
  const raw = window.localStorage.getItem(LIST_STORAGE_KEY);
  if (!raw) return emptyStore();
  try {
    const parsed: unknown = JSON.parse(raw);
    return isValidStore(parsed) ? parsed : emptyStore();
  } catch {
    return emptyStore();
  }
}

export function saveStore(store: ListStoreV1): void {
  if (!hasWindow()) return;
  window.localStorage.setItem(LIST_STORAGE_KEY, JSON.stringify(store));
}

export function getEntry(mediaId: number): ListEntry | null {
  return loadStore().entries[mediaId] ?? null;
}

export function upsertEntry(
  mediaId: number,
  patch: Partial<Omit<ListEntry, "updatedAt">>
): ListStoreV1 {
  const store = loadStore();
  const existing = store.entries[mediaId];
  const merged: ListEntry = {
    status: patch.status ?? existing?.status ?? "planning",
    score: patch.score !== undefined ? patch.score : existing?.score ?? null,
    progress: patch.progress ?? existing?.progress ?? 0,
    updatedAt: new Date().toISOString(),
  };
  const next: ListStoreV1 = {
    version: store.version,
    entries: { ...store.entries, [mediaId]: merged },
  };
  saveStore(next);
  return next;
}

export function removeEntry(mediaId: number): ListStoreV1 {
  const store = loadStore();
  const entries = { ...store.entries };
  delete entries[mediaId];
  const next: ListStoreV1 = { version: store.version, entries };
  saveStore(next);
  return next;
}

export function clearAll(): void {
  saveStore(emptyStore());
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- storage`
Expected: PASS, 7 tests.

- [ ] **Step 5: Run the full suite and typecheck**

Run: `npm test`
Expected: all tests PASS.

Run: `npx tsc --noEmit`
Expected: no type errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/list/storage.ts src/lib/list/__tests__/storage.test.ts
git commit -m "feat: add localStorage-backed list store CRUD"
```

---

## Self-Review Notes

- **Spec coverage (foundation slice):** AniList data layer with caching + retry (spec §3, §7) → Tasks 3–4. Versioned localStorage list-only store with corrupt-data degradation (spec §3, §7) → Tasks 5–6. Mocked-API testing (spec §8) → all data-layer tests stub `fetch`. Score scale 1–10 (spec constraint) → enforced in Task 5 validation.
- **Deferred to later plans:** UI pages/components (Plan 2), recommendation algorithm + stats (Plan 3). `getRecommendationsFor` and `relations`/`MediaRecommendation` types are built here so Plan 3 can consume them without touching the data layer.
- **Type consistency:** `Media`, `MediaTag`, `MediaStub`, `MediaRecommendation`, `ListEntry`, `ListStoreV1`, `ListStatus` are defined once (Tasks 2, 5) and reused by name in Tasks 4 and 6.
