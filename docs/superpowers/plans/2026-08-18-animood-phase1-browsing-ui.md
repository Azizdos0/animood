# Animood Phase 1 — Browsing UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the clickable browsing surface of Animood — home, search/browse, title detail, and my-list — on top of the existing AniList data layer and localStorage list store.

**Architecture:** Next.js App Router. Server Components fetch AniList data (cached, server-side); Client Components own everything that touches the user's list (which lives in `localStorage`). A module-singleton reactive store exposes the list via `useSyncExternalStore` so cards and editors update instantly on change, with a server snapshot to keep hydration clean. My-list display data is fetched by id through a small `/api/media` route handler so `localStorage` stays list-only.

**Tech Stack:** Next.js 16 (App Router, typed routes), React 19, TypeScript strict, Tailwind CSS v4, Vitest + @testing-library/react.

## Global Constraints

- TypeScript strict; no accounts, no server DB, no social features.
- Anything reading/writing the user's list is a Client Component (`"use client"`); AniList data fetching happens in Server Components or route handlers.
- User score scale is 1–10 (`score: number | null`).
- Tests never hit the real AniList network — mock `fetch` (data-layer/route tests) or the data functions (component tests).
- Import alias `@/` → `src/`. Detail route is `/media/[id]` (AniList ids are unique per media; `Media.type` distinguishes anime vs manga).
- Reuse existing modules; do not reimplement `src/lib/anilist/*` or `src/lib/list/{schema,storage}.ts`.

## Existing interfaces this plan consumes (already built & merged)

- `src/lib/anilist/media.ts`: `searchMedia(params)`, `getMediaById(id)`, `getTrending(type, perPage?)`, `getRecommendationsFor(mediaId, perPage?)`, `mapMedia(raw)`, and `RawMedia`.
- `src/lib/anilist/types.ts`: `Media`, `MediaType`, `MediaFormat`, `MediaTag`, `MediaStub`, `MediaRelationEdge`, `MediaRecommendation`.
- `src/lib/anilist/queries.ts`: `MEDIA_FIELDS` and query constants.
- `src/lib/anilist/client.ts`: `anilistRequest<T>(query, variables?, opts?)`, `AniListError`.
- `src/lib/list/schema.ts`: `ListStatus`, `LIST_STATUSES`, `ListEntry`, `ListStoreV1`, `emptyStore()`, `CURRENT_LIST_VERSION`.
- `src/lib/list/storage.ts`: `loadStore()`, `saveStore()`, `getEntry(id)`, `upsertEntry(id, patch)`, `removeEntry(id)`, `clearAll()`.

---

### Task 1: Reactive list-store hooks

**Files:**
- Create: `src/lib/list/reactive.ts`
- Test: `src/lib/list/__tests__/reactive.test.tsx`

**Interfaces:**
- Consumes: `loadStore`, `upsertEntry`, `removeEntry` (storage.ts); `emptyStore`, `ListEntry`, `ListStoreV1` (schema.ts).
- Produces:
  - `function subscribe(cb: () => void): () => void`
  - `function getSnapshot(): ListStoreV1`
  - `function getServerSnapshot(): ListStoreV1`
  - `function setEntry(mediaId: number, patch: Partial<Omit<ListEntry, "updatedAt">>): void`
  - `function deleteEntry(mediaId: number): void`
  - `function useListStore(): ListStoreV1`
  - `function useListEntry(mediaId: number): ListEntry | null`
  - `function __resetListCacheForTests(): void`

- [ ] **Step 1: Write the failing test at `src/lib/list/__tests__/reactive.test.tsx`**

```tsx
import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import {
  useListStore, useListEntry, setEntry, deleteEntry, __resetListCacheForTests,
} from "@/lib/list/reactive";

describe("reactive list store", () => {
  beforeEach(() => {
    localStorage.clear();
    __resetListCacheForTests();
  });

  it("useListEntry returns null when the title is not on the list", () => {
    const { result } = renderHook(() => useListEntry(5));
    expect(result.current).toBeNull();
  });

  it("setEntry updates subscribers and persists", () => {
    const { result } = renderHook(() => useListEntry(5));
    act(() => setEntry(5, { status: "watching", score: 8, progress: 3 }));
    expect(result.current?.status).toBe("watching");
    expect(result.current?.score).toBe(8);
    expect(localStorage.getItem("animood.list.v1")).toContain("watching");
  });

  it("deleteEntry removes the entry and notifies", () => {
    const { result } = renderHook(() => useListEntry(5));
    act(() => setEntry(5, { status: "planning" }));
    expect(result.current).not.toBeNull();
    act(() => deleteEntry(5));
    expect(result.current).toBeNull();
  });

  it("useListStore exposes all entries reactively", () => {
    const { result } = renderHook(() => useListStore());
    act(() => setEntry(7, { status: "completed", score: 9, progress: 12 }));
    expect(Object.keys(result.current.entries)).toContain("7");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- reactive`
Expected: FAIL — cannot find module `@/lib/list/reactive`.

- [ ] **Step 3: Implement `src/lib/list/reactive.ts`**

```ts
"use client";

import { useSyncExternalStore } from "react";
import { emptyStore, type ListEntry, type ListStoreV1 } from "./schema";
import { loadStore, upsertEntry, removeEntry } from "./storage";

let snapshot: ListStoreV1 | null = null;
const listeners = new Set<() => void>();

function current(): ListStoreV1 {
  if (snapshot === null) snapshot = loadStore();
  return snapshot;
}

function emit(): void {
  for (const l of listeners) l();
}

export function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

export function getSnapshot(): ListStoreV1 {
  return current();
}

export function getServerSnapshot(): ListStoreV1 {
  return emptyStore();
}

export function setEntry(
  mediaId: number,
  patch: Partial<Omit<ListEntry, "updatedAt">>
): void {
  snapshot = upsertEntry(mediaId, patch);
  emit();
}

export function deleteEntry(mediaId: number): void {
  snapshot = removeEntry(mediaId);
  emit();
}

export function useListStore(): ListStoreV1 {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

export function useListEntry(mediaId: number): ListEntry | null {
  const store = useListStore();
  return store.entries[mediaId] ?? null;
}

export function __resetListCacheForTests(): void {
  snapshot = null;
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npm test -- reactive`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/list/reactive.ts src/lib/list/__tests__/reactive.test.tsx
git commit -m "feat: add reactive list-store hooks"
```

---

### Task 2: getMediaByIds + /api/media route handler

**Files:**
- Modify: `src/lib/anilist/queries.ts` (add `MEDIA_BY_IDS_QUERY`)
- Modify: `src/lib/anilist/media.ts` (add `getMediaByIds`)
- Create: `src/app/api/media/route.ts`
- Test: `src/lib/anilist/__tests__/media-by-ids.test.ts`
- Test: `src/app/api/media/__tests__/route.test.ts`

**Interfaces:**
- Consumes: `anilistRequest`, `mapMedia`, `RawMedia`, `Media`.
- Produces:
  - `async function getMediaByIds(ids: number[]): Promise<Media[]>` — chunks ids into batches of 50, queries AniList `Page.media(id_in:)`, returns mapped media (order not guaranteed).
  - `GET(request)` route handler at `/api/media?ids=1,2,3` → `Response.json({ items: Media[] })`; empty/invalid ids → `{ items: [] }`.

- [ ] **Step 1: Add `MEDIA_BY_IDS_QUERY` to `src/lib/anilist/queries.ts`**

Append (reusing the existing `MEDIA_FIELDS` constant):

```ts
export const MEDIA_BY_IDS_QUERY = `
  query MediaByIds($ids: [Int], $perPage: Int) {
    Page(page: 1, perPage: $perPage) {
      media(id_in: $ids) { ${MEDIA_FIELDS} }
    }
  }
`;
```

- [ ] **Step 2: Write failing test at `src/lib/anilist/__tests__/media-by-ids.test.ts`**

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { getMediaByIds } from "@/lib/anilist/media";

const raw = (id: number) => ({
  id, type: "ANIME", title: { romaji: `T${id}`, english: null, native: null },
  coverImage: { large: `c${id}.jpg` }, bannerImage: null, description: null,
  genres: [], tags: [], format: "TV", episodes: 12, chapters: null,
  averageScore: 70, popularity: 100, seasonYear: 2020, relations: { edges: [] },
});

describe("getMediaByIds", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("returns empty array for empty input without calling fetch", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect(await getMediaByIds([])).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("maps returned media", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true, status: 200, headers: { get: () => null },
      json: async () => ({ data: { Page: { media: [raw(1), raw(2)] } } }),
    } as unknown as Response);
    vi.stubGlobal("fetch", fetchMock);

    const items = await getMediaByIds([1, 2]);
    expect(items.map((m) => m.id).sort()).toEqual([1, 2]);
    expect(items[0].title).toMatch(/^T/);
  });

  it("chunks ids into batches of 50", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true, status: 200, headers: { get: () => null },
      json: async () => ({ data: { Page: { media: [] } } }),
    } as unknown as Response);
    vi.stubGlobal("fetch", fetchMock);

    await getMediaByIds(Array.from({ length: 120 }, (_, i) => i + 1));
    expect(fetchMock).toHaveBeenCalledTimes(3); // 50 + 50 + 20
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npm test -- media-by-ids`
Expected: FAIL — `getMediaByIds` is not exported.

- [ ] **Step 4: Implement `getMediaByIds` in `src/lib/anilist/media.ts`**

Add the import of `MEDIA_BY_IDS_QUERY` to the existing queries import, then append:

```ts
export async function getMediaByIds(ids: number[]): Promise<Media[]> {
  if (ids.length === 0) return [];
  const chunks: number[][] = [];
  for (let i = 0; i < ids.length; i += 50) chunks.push(ids.slice(i, i + 50));

  const results = await Promise.all(
    chunks.map((chunk) =>
      anilistRequest<{ Page: { media: RawMedia[] } }>(MEDIA_BY_IDS_QUERY, {
        ids: chunk,
        perPage: 50,
      })
    )
  );
  return results.flatMap((r) => r.Page.media.map(mapMedia));
}
```

- [ ] **Step 5: Run it to verify it passes**

Run: `npm test -- media-by-ids`
Expected: PASS, 3 tests.

- [ ] **Step 6: Implement the route handler `src/app/api/media/route.ts`**

```ts
import { getMediaByIds } from "@/lib/anilist/media";

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const idsParam = url.searchParams.get("ids") ?? "";
  const ids = idsParam
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isInteger(n) && n > 0);

  if (ids.length === 0) return Response.json({ items: [] });

  try {
    const items = await getMediaByIds(ids);
    return Response.json({ items });
  } catch {
    return Response.json({ items: [], error: "fetch_failed" }, { status: 502 });
  }
}
```

- [ ] **Step 7: Write the route test at `src/app/api/media/__tests__/route.test.ts`**

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET } from "@/app/api/media/route";
import * as media from "@/lib/anilist/media";

describe("/api/media route", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("returns empty items for missing ids", async () => {
    const res = await GET(new Request("http://x/api/media"));
    expect(await res.json()).toEqual({ items: [] });
  });

  it("parses ids and returns fetched items", async () => {
    vi.spyOn(media, "getMediaByIds").mockResolvedValue([
      { id: 3 } as never,
    ]);
    const res = await GET(new Request("http://x/api/media?ids=3,foo,5"));
    const body = await res.json();
    expect(media.getMediaByIds).toHaveBeenCalledWith([3, 5]);
    expect(body.items).toHaveLength(1);
  });
});
```

- [ ] **Step 8: Run it to verify it passes**

Run: `npm test -- route`
Expected: PASS, 2 tests.

- [ ] **Step 9: Commit**

```bash
git add src/lib/anilist/queries.ts src/lib/anilist/media.ts src/app/api/media/route.ts src/lib/anilist/__tests__/media-by-ids.test.ts src/app/api/media/__tests__/route.test.ts
git commit -m "feat: add getMediaByIds and /api/media route handler"
```

---

### Task 3: MediaCard & MediaGrid components

**Files:**
- Create: `src/components/MediaCard.tsx`
- Create: `src/components/MediaGrid.tsx`
- Test: `src/components/__tests__/MediaCard.test.tsx`

**Interfaces:**
- Consumes: `useListEntry` (reactive.ts); `Media`/`MediaStub` types.
- Produces:
  - `interface MediaCardData { id: number; title: string; coverImage: string | null; format?: string | null }`
  - `function MediaCard({ media }: { media: MediaCardData }): JSX.Element` — Client Component; links to `/media/${id}`, shows cover, title, and (if on list) a status badge from `useListEntry`.
  - `function MediaGrid({ items }: { items: MediaCardData[] }): JSX.Element` — responsive grid of `MediaCard`; renders an empty-state message when `items` is empty.

- [ ] **Step 1: Write the failing test at `src/components/__tests__/MediaCard.test.tsx`**

```tsx
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MediaCard } from "@/components/MediaCard";
import { MediaGrid } from "@/components/MediaGrid";
import { setEntry, __resetListCacheForTests } from "@/lib/list/reactive";

const item = { id: 21, title: "One Piece", coverImage: "op.jpg", format: "TV" };

describe("MediaCard", () => {
  beforeEach(() => {
    localStorage.clear();
    __resetListCacheForTests();
  });

  it("renders title and a link to the detail page", () => {
    render(<MediaCard media={item} />);
    expect(screen.getByText("One Piece")).toBeInTheDocument();
    expect(screen.getByRole("link")).toHaveAttribute("href", "/media/21");
  });

  it("shows a status badge when the title is on the list", () => {
    setEntry(21, { status: "watching" });
    render(<MediaCard media={item} />);
    expect(screen.getByText(/watching/i)).toBeInTheDocument();
  });

  it("MediaGrid renders an empty state when there are no items", () => {
    render(<MediaGrid items={[]} />);
    expect(screen.getByText(/nothing here/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- MediaCard`
Expected: FAIL — cannot find module `@/components/MediaCard`.

- [ ] **Step 3: Implement `src/components/MediaCard.tsx`**

```tsx
"use client";

import Link from "next/link";
import { useListEntry } from "@/lib/list/reactive";

export interface MediaCardData {
  id: number;
  title: string;
  coverImage: string | null;
  format?: string | null;
}

export function MediaCard({ media }: { media: MediaCardData }) {
  const entry = useListEntry(media.id);

  return (
    <Link
      href={`/media/${media.id}`}
      className="group block overflow-hidden rounded-lg bg-black/5 transition hover:shadow-lg dark:bg-white/5"
    >
      <div className="relative aspect-[2/3] w-full bg-black/10 dark:bg-white/10">
        {media.coverImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={media.coverImage}
            alt={media.title}
            className="h-full w-full object-cover"
            loading="lazy"
          />
        ) : null}
        {entry ? (
          <span className="absolute left-1 top-1 rounded bg-indigo-600 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-white">
            {entry.status}
          </span>
        ) : null}
      </div>
      <div className="p-2">
        <p className="line-clamp-2 text-sm font-medium group-hover:text-indigo-500">
          {media.title}
        </p>
        {media.format ? (
          <p className="mt-0.5 text-xs opacity-60">{media.format}</p>
        ) : null}
      </div>
    </Link>
  );
}
```

- [ ] **Step 4: Implement `src/components/MediaGrid.tsx`**

```tsx
import { MediaCard, type MediaCardData } from "./MediaCard";

export function MediaGrid({ items }: { items: MediaCardData[] }) {
  if (items.length === 0) {
    return (
      <p className="py-12 text-center text-sm opacity-60">
        Nothing here yet.
      </p>
    );
  }
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
      {items.map((m) => (
        <MediaCard key={m.id} media={m} />
      ))}
    </div>
  );
}
```

- [ ] **Step 5: Run it to verify it passes**

Run: `npm test -- MediaCard`
Expected: PASS, 3 tests.

- [ ] **Step 6: Commit**

```bash
git add src/components/MediaCard.tsx src/components/MediaGrid.tsx src/components/__tests__/MediaCard.test.tsx
git commit -m "feat: add MediaCard and MediaGrid components"
```

---

### Task 4: ListEditor component

**Files:**
- Create: `src/components/ListEditor.tsx`
- Test: `src/components/__tests__/ListEditor.test.tsx`

**Interfaces:**
- Consumes: `useListEntry`, `setEntry`, `deleteEntry` (reactive.ts); `LIST_STATUSES`, `ListStatus` (schema.ts).
- Produces:
  - `function ListEditor({ mediaId }: { mediaId: number }): JSX.Element` — Client Component. If not on list, shows an "Add to list" button (adds as `planning`). If on list, shows a status `<select>`, a score `<select>` (1–10 + "–"), a numeric progress input, and a "Remove" button — all wired through the reactive store.

- [ ] **Step 1: Write the failing test at `src/components/__tests__/ListEditor.test.tsx`**

```tsx
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ListEditor } from "@/components/ListEditor";
import { getEntry } from "@/lib/list/storage";
import { __resetListCacheForTests } from "@/lib/list/reactive";

describe("ListEditor", () => {
  beforeEach(() => {
    localStorage.clear();
    __resetListCacheForTests();
  });

  it("adds a title to the list as planning", async () => {
    render(<ListEditor mediaId={42} />);
    await userEvent.click(screen.getByRole("button", { name: /add to list/i }));
    expect(getEntry(42)?.status).toBe("planning");
    expect(screen.getByRole("button", { name: /remove/i })).toBeInTheDocument();
  });

  it("changes status through the select", async () => {
    render(<ListEditor mediaId={42} />);
    await userEvent.click(screen.getByRole("button", { name: /add to list/i }));
    await userEvent.selectOptions(screen.getByLabelText(/status/i), "completed");
    expect(getEntry(42)?.status).toBe("completed");
  });

  it("removes a title from the list", async () => {
    render(<ListEditor mediaId={42} />);
    await userEvent.click(screen.getByRole("button", { name: /add to list/i }));
    await userEvent.click(screen.getByRole("button", { name: /remove/i }));
    expect(getEntry(42)).toBeNull();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- ListEditor`
Expected: FAIL — cannot find module `@/components/ListEditor`.

- [ ] **Step 3: Implement `src/components/ListEditor.tsx`**

```tsx
"use client";

import { LIST_STATUSES, type ListStatus } from "@/lib/list/schema";
import { useListEntry, setEntry, deleteEntry } from "@/lib/list/reactive";

const SCORES = [10, 9, 8, 7, 6, 5, 4, 3, 2, 1];

export function ListEditor({ mediaId }: { mediaId: number }) {
  const entry = useListEntry(mediaId);

  if (!entry) {
    return (
      <button
        type="button"
        onClick={() => setEntry(mediaId, { status: "planning" })}
        className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500"
      >
        Add to list
      </button>
    );
  }

  return (
    <div className="flex flex-wrap items-end gap-3">
      <label className="flex flex-col text-xs font-medium">
        Status
        <select
          aria-label="Status"
          value={entry.status}
          onChange={(e) => setEntry(mediaId, { status: e.target.value as ListStatus })}
          className="mt-1 rounded border bg-transparent px-2 py-1 text-sm"
        >
          {LIST_STATUSES.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </label>

      <label className="flex flex-col text-xs font-medium">
        Score
        <select
          aria-label="Score"
          value={entry.score ?? ""}
          onChange={(e) =>
            setEntry(mediaId, { score: e.target.value ? Number(e.target.value) : null })
          }
          className="mt-1 rounded border bg-transparent px-2 py-1 text-sm"
        >
          <option value="">–</option>
          {SCORES.map((n) => (
            <option key={n} value={n}>{n}</option>
          ))}
        </select>
      </label>

      <label className="flex flex-col text-xs font-medium">
        Progress
        <input
          aria-label="Progress"
          type="number"
          min={0}
          value={entry.progress}
          onChange={(e) => setEntry(mediaId, { progress: Number(e.target.value) })}
          className="mt-1 w-20 rounded border bg-transparent px-2 py-1 text-sm"
        />
      </label>

      <button
        type="button"
        onClick={() => deleteEntry(mediaId)}
        className="rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-red-500 hover:text-white"
      >
        Remove
      </button>
    </div>
  );
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npm test -- ListEditor`
Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add src/components/ListEditor.tsx src/components/__tests__/ListEditor.test.tsx
git commit -m "feat: add ListEditor component"
```

---

### Task 5: App shell (Navbar) + Home page

**Files:**
- Create: `src/components/Navbar.tsx`
- Modify: `src/app/layout.tsx` (add Navbar + main wrapper)
- Create: `src/components/MediaRow.tsx`
- Modify: `src/app/page.tsx` (Home: trending anime + manga rows)
- Test: `src/components/__tests__/Navbar.test.tsx`

**Interfaces:**
- Consumes: `getTrending` (media.ts); `MediaGrid`/`MediaCardData`; `Media`.
- Produces:
  - `function Navbar(): JSX.Element` — links to Home (`/`), Search (`/search`), My List (`/my-list`).
  - `function MediaRow({ title, items }: { title: string; items: MediaCardData[] }): JSX.Element` — a titled horizontal-scrolling row of cards.
  - Home `page.tsx` (Server Component, async) fetching `getTrending("ANIME")` and `getTrending("MANGA")` and rendering two `MediaRow`s. Wrap the fetch in try/catch → render a soft error notice on failure (spec §7).
  - `function toCardData(m: Media): MediaCardData` — exported helper in `src/components/MediaRow.tsx` mapping a `Media` to card props.

- [ ] **Step 1: Write the failing test at `src/components/__tests__/Navbar.test.tsx`**

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Navbar } from "@/components/Navbar";
import { toCardData } from "@/components/MediaRow";

describe("Navbar", () => {
  it("renders the primary nav links", () => {
    render(<Navbar />);
    expect(screen.getByRole("link", { name: /animood/i })).toHaveAttribute("href", "/");
    expect(screen.getByRole("link", { name: /search/i })).toHaveAttribute("href", "/search");
    expect(screen.getByRole("link", { name: /my list/i })).toHaveAttribute("href", "/my-list");
  });
});

describe("toCardData", () => {
  it("maps a Media to card props", () => {
    const card = toCardData({
      id: 9, title: "Naruto", coverImage: "n.jpg", format: "TV",
    } as never);
    expect(card).toEqual({ id: 9, title: "Naruto", coverImage: "n.jpg", format: "TV" });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- Navbar`
Expected: FAIL — cannot find module `@/components/Navbar`.

- [ ] **Step 3: Implement `src/components/Navbar.tsx`**

```tsx
import Link from "next/link";

export function Navbar() {
  return (
    <header className="sticky top-0 z-10 border-b border-black/10 bg-background/80 backdrop-blur dark:border-white/10">
      <nav className="mx-auto flex max-w-6xl items-center gap-6 px-4 py-3">
        <Link href="/" className="text-lg font-bold tracking-tight">
          Animood
        </Link>
        <div className="ml-auto flex items-center gap-4 text-sm font-medium">
          <Link href="/search" className="hover:text-indigo-500">Search</Link>
          <Link href="/my-list" className="hover:text-indigo-500">My List</Link>
        </div>
      </nav>
    </header>
  );
}
```

- [ ] **Step 4: Implement `src/components/MediaRow.tsx`**

```tsx
import type { Media } from "@/lib/anilist/types";
import { MediaCard, type MediaCardData } from "./MediaCard";

export function toCardData(m: Media): MediaCardData {
  return { id: m.id, title: m.title, coverImage: m.coverImage, format: m.format };
}

export function MediaRow({ title, items }: { title: string; items: MediaCardData[] }) {
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold">{title}</h2>
      <div className="flex gap-4 overflow-x-auto pb-2">
        {items.map((m) => (
          <div key={m.id} className="w-32 shrink-0">
            <MediaCard media={m} />
          </div>
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 5: Update `src/app/layout.tsx`**

Keep the existing font setup and metadata. Add the Navbar and a `<main>` wrapper around `{children}`:

```tsx
import { Navbar } from "@/components/Navbar";
```

Change the `<body>` to:

```tsx
<body className="min-h-full flex flex-col">
  <Navbar />
  <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">{children}</main>
</body>
```

- [ ] **Step 6: Replace `src/app/page.tsx` with the Home page**

```tsx
import { getTrending } from "@/lib/anilist/media";
import { MediaRow, toCardData } from "@/components/MediaRow";

export default async function HomePage() {
  try {
    const [anime, manga] = await Promise.all([
      getTrending("ANIME", 12),
      getTrending("MANGA", 12),
    ]);
    return (
      <div className="space-y-10">
        <MediaRow title="Trending Anime" items={anime.map(toCardData)} />
        <MediaRow title="Trending Manga" items={manga.map(toCardData)} />
      </div>
    );
  } catch {
    return (
      <p className="py-12 text-center text-sm opacity-70">
        Couldn&apos;t load trending titles right now. Please try again later.
      </p>
    );
  }
}
```

- [ ] **Step 7: Run tests and build**

Run: `npm test -- Navbar`
Expected: PASS.

Run: `npm run build`
Expected: build succeeds (Home is dynamically rendered via AniList fetch; that is fine).

- [ ] **Step 8: Commit**

```bash
git add src/components/Navbar.tsx src/components/MediaRow.tsx src/app/layout.tsx src/app/page.tsx src/components/__tests__/Navbar.test.tsx
git commit -m "feat: add app shell navbar and trending home page"
```

---

### Task 6: Search / Browse page

**Files:**
- Create: `src/components/SearchControls.tsx`
- Create: `src/app/search/page.tsx`
- Test: `src/components/__tests__/SearchControls.test.tsx`

**Interfaces:**
- Consumes: `searchMedia` (media.ts); `MediaGrid`/`toCardData`; `MediaType`, `MediaFormat`.
- Produces:
  - `function SearchControls({ initial }: { initial: SearchControlsState }): JSX.Element` — Client Component with a text input + type toggle (Anime/Manga) + format `<select>`; on submit it pushes to `/search?...` via `useRouter`. `interface SearchControlsState { q: string; type: MediaType; format: string }`.
  - Search `page.tsx` (Server Component, async) that reads `searchParams`, calls `searchMedia`, and renders `SearchControls` + `MediaGrid`. Wrap the fetch in try/catch → soft error notice.

- [ ] **Step 1: Write the failing test at `src/components/__tests__/SearchControls.test.tsx`**

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

import { SearchControls } from "@/components/SearchControls";

describe("SearchControls", () => {
  beforeEach(() => push.mockClear());

  it("navigates to a search URL with the query and type", async () => {
    render(<SearchControls initial={{ q: "", type: "ANIME", format: "" }} />);
    await userEvent.type(screen.getByRole("searchbox"), "cowboy");
    await userEvent.click(screen.getByRole("button", { name: /search/i }));
    expect(push).toHaveBeenCalledWith(expect.stringContaining("q=cowboy"));
    expect(push).toHaveBeenCalledWith(expect.stringContaining("type=ANIME"));
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- SearchControls`
Expected: FAIL — cannot find module `@/components/SearchControls`.

- [ ] **Step 3: Implement `src/components/SearchControls.tsx`**

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { MediaType } from "@/lib/anilist/types";

export interface SearchControlsState {
  q: string;
  type: MediaType;
  format: string;
}

const FORMATS = ["", "TV", "MOVIE", "OVA", "ONA", "SPECIAL", "MANGA", "NOVEL"];

export function SearchControls({ initial }: { initial: SearchControlsState }) {
  const router = useRouter();
  const [q, setQ] = useState(initial.q);
  const [type, setType] = useState<MediaType>(initial.type);
  const [format, setFormat] = useState(initial.format);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    params.set("type", type);
    if (format) params.set("format", format);
    router.push(`/search?${params.toString()}`);
  }

  return (
    <form onSubmit={submit} className="flex flex-wrap items-center gap-3">
      <input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search titles…"
        className="min-w-48 flex-1 rounded-md border bg-transparent px-3 py-2 text-sm"
      />
      <select
        aria-label="Type"
        value={type}
        onChange={(e) => setType(e.target.value as MediaType)}
        className="rounded-md border bg-transparent px-2 py-2 text-sm"
      >
        <option value="ANIME">Anime</option>
        <option value="MANGA">Manga</option>
      </select>
      <select
        aria-label="Format"
        value={format}
        onChange={(e) => setFormat(e.target.value)}
        className="rounded-md border bg-transparent px-2 py-2 text-sm"
      >
        {FORMATS.map((f) => (
          <option key={f} value={f}>{f || "Any format"}</option>
        ))}
      </select>
      <button
        type="submit"
        className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500"
      >
        Search
      </button>
    </form>
  );
}
```

- [ ] **Step 4: Implement `src/app/search/page.tsx`**

Note: in Next 16, `searchParams` is a Promise — await it.

```tsx
import { searchMedia } from "@/lib/anilist/media";
import type { MediaFormat, MediaType } from "@/lib/anilist/types";
import { MediaGrid } from "@/components/MediaGrid";
import { toCardData } from "@/components/MediaRow";
import { SearchControls } from "@/components/SearchControls";

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; type?: string; format?: string }>;
}) {
  const sp = await searchParams;
  const type: MediaType = sp.type === "MANGA" ? "MANGA" : "ANIME";
  const q = sp.q ?? "";
  const format = sp.format ?? "";

  let items: ReturnType<typeof toCardData>[] = [];
  let failed = false;
  try {
    const res = await searchMedia({
      search: q || undefined,
      type,
      format: (format || undefined) as MediaFormat | undefined,
      perPage: 24,
    });
    items = res.items.map(toCardData);
  } catch {
    failed = true;
  }

  return (
    <div className="space-y-6">
      <SearchControls initial={{ q, type, format }} />
      {failed ? (
        <p className="py-12 text-center text-sm opacity-70">
          Search is unavailable right now. Please try again later.
        </p>
      ) : (
        <MediaGrid items={items} />
      )}
    </div>
  );
}
```

- [ ] **Step 5: Run tests and build**

Run: `npm test -- SearchControls`
Expected: PASS.

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 6: Commit**

```bash
git add src/components/SearchControls.tsx src/app/search/page.tsx src/components/__tests__/SearchControls.test.tsx
git commit -m "feat: add search/browse page with filters"
```

---

### Task 7: Media detail page

**Files:**
- Create: `src/lib/anilist/relations.ts` (pure helper for sequel/continue-watching logic)
- Create: `src/app/media/[id]/page.tsx`
- Test: `src/lib/anilist/__tests__/relations.test.ts`

**Interfaces:**
- Consumes: `getMediaById` (media.ts); `Media`, `MediaRelationEdge`; `ListEditor`.
- Produces:
  - `function relatedByType(media: Media, relationType: string): MediaStub[]` — returns related stubs of a given relation type (e.g. "SEQUEL", "PREQUEL").
  - Detail `page.tsx` (Server Component, async): fetches media by id; if null → `notFound()`. Renders banner/cover, title, meta (format, episodes/chapters, score, year), description (stripped/rendered as text), genres, tags, a `ListEditor`, and a "Relations" section. Sequels are labeled so the UI can later drive "Continue watching" (spec §4).

- [ ] **Step 1: Write the failing test at `src/lib/anilist/__tests__/relations.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { relatedByType } from "@/lib/anilist/relations";
import type { Media } from "@/lib/anilist/types";

const media = {
  id: 1, type: "ANIME", title: "S1", coverImage: null, bannerImage: null,
  description: null, genres: [], tags: [], format: "TV", episodes: 12,
  chapters: null, averageScore: null, popularity: 0, seasonYear: null,
  relations: [
    { relationType: "SEQUEL", node: { id: 2, title: "S2", coverImage: null, format: "TV" } },
    { relationType: "ADAPTATION", node: { id: 3, title: "Manga", coverImage: null, format: "MANGA" } },
  ],
} as Media;

describe("relatedByType", () => {
  it("returns only relations of the requested type", () => {
    const sequels = relatedByType(media, "SEQUEL");
    expect(sequels).toHaveLength(1);
    expect(sequels[0].id).toBe(2);
  });

  it("returns an empty array when none match", () => {
    expect(relatedByType(media, "PREQUEL")).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- relations`
Expected: FAIL — cannot find module `@/lib/anilist/relations`.

- [ ] **Step 3: Implement `src/lib/anilist/relations.ts`**

```ts
import type { Media, MediaStub } from "./types";

export function relatedByType(media: Media, relationType: string): MediaStub[] {
  return media.relations
    .filter((r) => r.relationType === relationType)
    .map((r) => r.node);
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npm test -- relations`
Expected: PASS, 2 tests.

- [ ] **Step 5: Implement `src/app/media/[id]/page.tsx`**

```tsx
import { notFound } from "next/navigation";
import { getMediaById } from "@/lib/anilist/media";
import { relatedByType } from "@/lib/anilist/relations";
import { ListEditor } from "@/components/ListEditor";
import { MediaCard } from "@/components/MediaCard";

export default async function MediaDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const mediaId = Number(id);
  if (!Number.isInteger(mediaId)) notFound();

  const media = await getMediaById(mediaId);
  if (!media) notFound();

  const sequels = relatedByType(media, "SEQUEL");
  const description = (media.description ?? "").replace(/<[^>]+>/g, "");

  return (
    <article className="space-y-8">
      <div className="flex flex-col gap-6 sm:flex-row">
        {media.coverImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={media.coverImage}
            alt={media.title}
            className="w-40 shrink-0 self-start rounded-lg object-cover"
          />
        ) : null}
        <div className="space-y-3">
          <h1 className="text-2xl font-bold">{media.title}</h1>
          <p className="text-sm opacity-70">
            {[media.format, media.seasonYear, media.episodes ? `${media.episodes} eps` : null,
              media.chapters ? `${media.chapters} ch` : null,
              media.averageScore ? `★ ${media.averageScore}` : null]
              .filter(Boolean).join(" · ")}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {media.genres.map((g) => (
              <span key={g} className="rounded-full bg-black/10 px-2 py-0.5 text-xs dark:bg-white/10">
                {g}
              </span>
            ))}
          </div>
          <ListEditor mediaId={media.id} />
        </div>
      </div>

      {description ? <p className="max-w-3xl text-sm leading-relaxed">{description}</p> : null}

      {sequels.length > 0 ? (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Sequels</h2>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 md:grid-cols-6">
            {sequels.map((s) => (
              <MediaCard
                key={s.id}
                media={{ id: s.id, title: s.title, coverImage: s.coverImage, format: s.format }}
              />
            ))}
          </div>
        </section>
      ) : null}
    </article>
  );
}
```

- [ ] **Step 6: Build**

Run: `npm run build`
Expected: build succeeds; `/media/[id]` compiles as a dynamic route.

- [ ] **Step 7: Commit**

```bash
git add src/lib/anilist/relations.ts "src/app/media/[id]/page.tsx" src/lib/anilist/__tests__/relations.test.ts
git commit -m "feat: add media detail page with relations"
```

---

### Task 8: My List page

**Files:**
- Create: `src/lib/list/grouping.ts` (pure helper: group entry ids by status)
- Create: `src/components/MyListView.tsx` (Client Component)
- Create: `src/app/my-list/page.tsx` (thin Server Component wrapper)
- Test: `src/lib/list/__tests__/grouping.test.ts`

**Interfaces:**
- Consumes: `useListStore` (reactive.ts); `LIST_STATUSES`, `ListStatus`, `ListStoreV1`; `/api/media` route; `MediaCard`.
- Produces:
  - `function groupIdsByStatus(store: ListStoreV1): Record<ListStatus, number[]>` — buckets media ids by status.
  - `function MyListView(): JSX.Element` — Client Component: reads the reactive store, fetches display data for all listed ids from `/api/media?ids=…`, and renders one section per non-empty status with a `MediaCard` grid. Shows a cold-start empty state when the list is empty.
  - My-list `page.tsx` renders `<MyListView />`.

- [ ] **Step 1: Write the failing test at `src/lib/list/__tests__/grouping.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { groupIdsByStatus } from "@/lib/list/grouping";
import type { ListStoreV1 } from "@/lib/list/schema";

const store: ListStoreV1 = {
  version: 1,
  entries: {
    1: { status: "watching", score: null, progress: 1, updatedAt: "" },
    2: { status: "completed", score: 9, progress: 12, updatedAt: "" },
    3: { status: "watching", score: 7, progress: 3, updatedAt: "" },
  },
};

describe("groupIdsByStatus", () => {
  it("buckets ids by status", () => {
    const grouped = groupIdsByStatus(store);
    expect(grouped.watching.sort()).toEqual([1, 3]);
    expect(grouped.completed).toEqual([2]);
    expect(grouped.planning).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- grouping`
Expected: FAIL — cannot find module `@/lib/list/grouping`.

- [ ] **Step 3: Implement `src/lib/list/grouping.ts`**

```ts
import { LIST_STATUSES, type ListStatus, type ListStoreV1 } from "./schema";

export function groupIdsByStatus(store: ListStoreV1): Record<ListStatus, number[]> {
  const grouped = Object.fromEntries(
    LIST_STATUSES.map((s) => [s, [] as number[]])
  ) as Record<ListStatus, number[]>;

  for (const [id, entry] of Object.entries(store.entries)) {
    grouped[entry.status].push(Number(id));
  }
  return grouped;
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npm test -- grouping`
Expected: PASS, 1 test.

- [ ] **Step 5: Implement `src/components/MyListView.tsx`**

```tsx
"use client";

import { useEffect, useState } from "react";
import { useListStore } from "@/lib/list/reactive";
import { groupIdsByStatus } from "@/lib/list/grouping";
import { LIST_STATUSES } from "@/lib/list/schema";
import { MediaCard, type MediaCardData } from "@/components/MediaCard";

export function MyListView() {
  const store = useListStore();
  const ids = Object.keys(store.entries).map(Number);
  const [cards, setCards] = useState<Record<number, MediaCardData>>({});

  useEffect(() => {
    if (ids.length === 0) return;
    const controller = new AbortController();
    fetch(`/api/media?ids=${ids.join(",")}`, { signal: controller.signal })
      .then((r) => r.json())
      .then((body: { items: MediaCardData[] }) => {
        const map: Record<number, MediaCardData> = {};
        for (const item of body.items) map[item.id] = item;
        setCards(map);
      })
      .catch(() => {});
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids.join(",")]);

  if (ids.length === 0) {
    return (
      <div className="py-16 text-center">
        <p className="text-sm opacity-70">
          Your list is empty. Browse titles and add them to get started.
        </p>
      </div>
    );
  }

  const grouped = groupIdsByStatus(store);

  return (
    <div className="space-y-10">
      {LIST_STATUSES.filter((s) => grouped[s].length > 0).map((status) => (
        <section key={status} className="space-y-3">
          <h2 className="text-lg font-semibold capitalize">
            {status} ({grouped[status].length})
          </h2>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
            {grouped[status].map((id) =>
              cards[id] ? (
                <MediaCard key={id} media={cards[id]} />
              ) : (
                <div key={id} className="aspect-[2/3] animate-pulse rounded-lg bg-black/10 dark:bg-white/10" />
              )
            )}
          </div>
        </section>
      ))}
    </div>
  );
}
```

- [ ] **Step 6: Implement `src/app/my-list/page.tsx`**

```tsx
import { MyListView } from "@/components/MyListView";

export default function MyListPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">My List</h1>
      <MyListView />
    </div>
  );
}
```

- [ ] **Step 7: Run the full suite, typecheck, and build**

Run: `npm test`
Expected: all tests PASS.

Run: `npx tsc --noEmit`
Expected: no type errors.

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 8: Commit**

```bash
git add src/lib/list/grouping.ts src/components/MyListView.tsx src/app/my-list/page.tsx src/lib/list/__tests__/grouping.test.ts
git commit -m "feat: add my-list page"
```

---

## Self-Review Notes

- **Spec coverage (browsing slice):** Home/trending (spec §5) → Task 5. Browse/search with filters (§5) → Task 6. Title detail with relations + sequel labeling toward "Continue watching" (§4, §5) → Task 7. My List grouped by status with inline add/edit via ListEditor (§5) → Tasks 4 + 8. Modern UI (spec vision) → Tailwind throughout. Error/empty states (§7) → soft-error notices on every AniList fetch + empty states in MediaGrid/MyListView.
- **Deferred to Plan 3:** the recommendation engine + recommendations page, the diversity dial, "why" tags, cold-start onboarding, and the stats dashboard. Task 7 deliberately only *labels* sequels; the "Continue watching" row that suppresses unwatched sequels is a recommendation-engine concern (Plan 3).
- **Client/server split:** every list-touching unit (`reactive.ts`, `MediaCard`, `ListEditor`, `MyListView`, `SearchControls`) is a Client Component; all AniList fetching is in Server Components (`page.tsx` files) or the `/api/media` route. Matches the global constraint.
- **Type consistency:** `MediaCardData` defined once (Task 3) and reused by `MediaGrid`, `MediaRow.toCardData`, `MyListView`. Reactive API (`setEntry`/`deleteEntry`/`useListEntry`/`useListStore`/`__resetListCacheForTests`) defined in Task 1 and consumed by Tasks 3, 4, 8. `toCardData` defined in Task 5 (`MediaRow.tsx`) and reused in Task 6.
- **Next 16 notes:** `params` and `searchParams` are Promises (awaited in Tasks 6–7). Typed routes: `href={`/media/${id}`}` uses a template literal; if the typed-routes checker rejects it during build, the implementer may cast via `as Route` (from `next`) — record any such cast in the report.
