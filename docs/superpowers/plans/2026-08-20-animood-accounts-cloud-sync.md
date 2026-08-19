# Animood — Accounts & Cloud Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add optional "Sign in with Google" + automatic cloud sync of the user's list on Supabase, while keeping the app fully usable anonymously (localStorage stays the working copy).

**Architecture:** The `localStorage` reactive store remains the UI source of truth. When signed in, a client `SyncProvider` pulls the user's cloud rows, merges them with local (last-write-wins per title by `updatedAt`), applies the merged result locally, and reconciles the cloud (upsert all + delete removed) on every debounced change. Supabase Auth (Google) manages sessions; a callback route exchanges the OAuth code. If Supabase env vars are absent, the app runs in pure-local mode and the sign-in UI is hidden.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript strict, Supabase (`@supabase/supabase-js`, `@supabase/ssr`), Google OAuth, Vitest.

## Global Constraints

- TypeScript strict.
- The signed-out / unconfigured path MUST behave exactly as today (localStorage only). The existing 132 tests must stay green.
- Supabase writes use the anon key + the signed-in user's JWT; RLS enforces isolation. **No service-role key in the app.**
- Merge is **last-write-wins per `media_id` by `updatedAt`**, union only — never drop a title during merge.
- Env var names (exact): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- DB table (exact): `public.list_entries(user_id uuid, media_id int, status text, score int null, progress int, updated_at timestamptz, primary key (user_id, media_id))` with RLS `auth.uid() = user_id`.
- Import alias `@/` → `src/`. Score scale 1–10; statuses are `ListStatus`.

## Existing interfaces consumed (already in the repo)

- `src/lib/list/schema.ts`: `ListStatus`, `LIST_STATUSES`, `ListEntry` (`{ status, score, progress, updatedAt }`), `ListStoreV1` (`{ version: 1, entries: Record<number, ListEntry> }`), `emptyStore()`, `isValidStore()`, `CURRENT_LIST_VERSION`.
- `src/lib/list/storage.ts`: `loadStore()`, `saveStore(store)`, `LIST_STORAGE_KEY`, plus internal `clampScore`/`clampProgress` (not exported).
- `src/lib/list/reactive.ts`: `useListStore()`, `getSnapshot()`, `subscribe(cb)`, `setEntry`, `deleteEntry`, `importEntries(items)`, `__resetListCacheForTests()`.
- `src/components/Navbar.tsx`: currently renders a static "SYNCED · LOCAL" chip in the top header.

---

### Task 1: Pure merge core & row mappers

**Files:**
- Create: `src/lib/sync/types.ts`
- Create: `src/lib/sync/merge.ts`
- Test: `src/lib/sync/__tests__/merge.test.ts`

**Interfaces:**
- Consumes: `ListEntry`, `ListStatus`, `ListStoreV1`, `emptyStore` (list schema).
- Produces:
  - `interface CloudRow { user_id: string; media_id: number; status: ListStatus; score: number | null; progress: number; updated_at: string }`
  - `function rowToEntry(row: CloudRow): { mediaId: number; entry: ListEntry }`
  - `function entryToRow(userId: string, mediaId: number, entry: ListEntry): CloudRow`
  - `function mergeLists(local: ListStoreV1, cloud: CloudRow[]): ListStoreV1` — union of all media ids; for ids in both, keep the entry whose `updatedAt`/`updated_at` is newer (string ISO compare is safe); pure.

- [ ] **Step 1: Write the failing test at `src/lib/sync/__tests__/merge.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { mergeLists, rowToEntry, entryToRow, type CloudRow } from "@/lib/sync/merge";
import type { ListStoreV1 } from "@/lib/list/schema";

const store = (entries: ListStoreV1["entries"]): ListStoreV1 => ({ version: 1, entries });
const row = (media_id: number, updated_at: string, over: Partial<CloudRow> = {}): CloudRow => ({
  user_id: "u1", media_id, status: "watching", score: null, progress: 0, updated_at, ...over,
});

describe("row mappers", () => {
  it("round-trips a row through entry and back", () => {
    const r = row(5, "2026-01-01T00:00:00.000Z", { status: "completed", score: 9, progress: 12 });
    const { mediaId, entry } = rowToEntry(r);
    expect(mediaId).toBe(5);
    expect(entry).toEqual({ status: "completed", score: 9, progress: 12, updatedAt: r.updated_at });
    expect(entryToRow("u1", mediaId, entry)).toEqual(r);
  });
});

describe("mergeLists", () => {
  it("keeps ids present on only one side (union, never drops)", () => {
    const local = store({ 1: { status: "watching", score: null, progress: 3, updatedAt: "2026-01-01T00:00:00.000Z" } });
    const cloud = [row(2, "2026-01-01T00:00:00.000Z", { status: "planning" })];
    const merged = mergeLists(local, cloud);
    expect(Object.keys(merged.entries).sort()).toEqual(["1", "2"]);
  });

  it("keeps the newer entry when an id is on both sides", () => {
    const local = store({ 1: { status: "watching", score: 5, progress: 3, updatedAt: "2026-01-02T00:00:00.000Z" } });
    const cloud = [row(1, "2026-01-01T00:00:00.000Z", { status: "completed", score: 10, progress: 12 })];
    const merged = mergeLists(local, cloud);
    expect(merged.entries[1].score).toBe(5); // local is newer
  });

  it("prefers cloud when cloud is newer", () => {
    const local = store({ 1: { status: "watching", score: 5, progress: 3, updatedAt: "2026-01-01T00:00:00.000Z" } });
    const cloud = [row(1, "2026-01-03T00:00:00.000Z", { status: "completed", score: 10, progress: 12 })];
    const merged = mergeLists(local, cloud);
    expect(merged.entries[1].score).toBe(10);
  });

  it("handles empty local and empty cloud", () => {
    expect(Object.keys(mergeLists(store({}), []).entries)).toHaveLength(0);
    const cloud = [row(9, "2026-01-01T00:00:00.000Z")];
    expect(Object.keys(mergeLists(store({}), cloud).entries)).toEqual(["9"]);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- sync/__tests__/merge`
Expected: FAIL — cannot find module `@/lib/sync/merge`.

- [ ] **Step 3: Implement `src/lib/sync/types.ts`**

```ts
import type { ListStatus } from "@/lib/list/schema";

export interface CloudRow {
  user_id: string;
  media_id: number;
  status: ListStatus;
  score: number | null;
  progress: number;
  updated_at: string; // ISO timestamp
}
```

- [ ] **Step 4: Implement `src/lib/sync/merge.ts`**

```ts
import type { ListEntry, ListStoreV1 } from "@/lib/list/schema";
import { CURRENT_LIST_VERSION } from "@/lib/list/schema";
import type { CloudRow } from "./types";

export type { CloudRow };

export function rowToEntry(row: CloudRow): { mediaId: number; entry: ListEntry } {
  return {
    mediaId: row.media_id,
    entry: {
      status: row.status,
      score: row.score,
      progress: row.progress,
      updatedAt: row.updated_at,
    },
  };
}

export function entryToRow(userId: string, mediaId: number, entry: ListEntry): CloudRow {
  return {
    user_id: userId,
    media_id: mediaId,
    status: entry.status,
    score: entry.score,
    progress: entry.progress,
    updated_at: entry.updatedAt,
  };
}

export function mergeLists(local: ListStoreV1, cloud: CloudRow[]): ListStoreV1 {
  const entries: ListStoreV1["entries"] = { ...local.entries };
  for (const row of cloud) {
    const { mediaId, entry } = rowToEntry(row);
    const existing = entries[mediaId];
    if (!existing || row.updated_at > existing.updatedAt) {
      entries[mediaId] = entry;
    }
  }
  return { version: CURRENT_LIST_VERSION, entries };
}
```

- [ ] **Step 5: Run to verify it passes**

Run: `npm test -- sync/__tests__/merge`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/sync/types.ts src/lib/sync/merge.ts src/lib/sync/__tests__/merge.test.ts
git commit -m "feat: add pure list merge core for cloud sync"
```

---

### Task 2: `replaceStore` — apply a full store preserving timestamps

**Files:**
- Modify: `src/lib/list/storage.ts` (add `replaceStore`)
- Modify: `src/lib/list/reactive.ts` (add `replaceStore`)
- Test: `src/lib/list/__tests__/replace.test.ts`

**Interfaces:**
- Consumes: `ListStoreV1`, `LIST_STATUSES`, `emptyStore`, `saveStore`, `loadStore` (list layer).
- Produces:
  - storage: `function replaceStore(store: ListStoreV1): ListStoreV1` — sanitizes (drop entries with an invalid status; clamp `score` to 1–10 or null; floor `progress` at 0) **but preserves each entry's `updatedAt`**, persists, returns the sanitized store. Unlike `bulkUpsert`, it does NOT stamp `updatedAt = now` — merge timestamps must survive.
  - reactive: `function replaceStore(store: ListStoreV1): void` — calls storage `replaceStore`, updates the snapshot, emits.

- [ ] **Step 1: Write the failing test at `src/lib/list/__tests__/replace.test.ts`**

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { replaceStore, loadStore } from "@/lib/list/storage";
import type { ListStoreV1 } from "@/lib/list/schema";

describe("replaceStore", () => {
  beforeEach(() => localStorage.clear());

  it("replaces the whole store and preserves updatedAt", () => {
    const store: ListStoreV1 = { version: 1, entries: {
      5: { status: "completed", score: 9, progress: 12, updatedAt: "2026-01-01T00:00:00.000Z" },
    } };
    replaceStore(store);
    expect(loadStore().entries[5].updatedAt).toBe("2026-01-01T00:00:00.000Z");
  });

  it("drops invalid entries and clamps out-of-range values", () => {
    const store = { version: 1, entries: {
      1: { status: "watching", score: 42, progress: -5, updatedAt: "2026-01-01T00:00:00.000Z" },
      2: { status: "bogus", score: 5, progress: 1, updatedAt: "2026-01-01T00:00:00.000Z" },
    } } as unknown as ListStoreV1;
    replaceStore(store);
    const out = loadStore();
    expect(out.entries[1].score).toBe(10);
    expect(out.entries[1].progress).toBe(0);
    expect(out.entries[2]).toBeUndefined(); // invalid status dropped
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- list/__tests__/replace`
Expected: FAIL — `replaceStore` is not exported.

- [ ] **Step 3: Add `replaceStore` to `src/lib/list/storage.ts`**

Add near `bulkUpsert` (reuse the existing `clampScore`/`clampProgress`; import `LIST_STATUSES` if not already):

```ts
export function replaceStore(store: ListStoreV1): ListStoreV1 {
  const entries: ListStoreV1["entries"] = {};
  for (const [key, value] of Object.entries(store.entries ?? {})) {
    const id = Number(key);
    if (!Number.isInteger(id)) continue;
    if (!LIST_STATUSES.includes(value.status)) continue;
    entries[id] = {
      status: value.status,
      score: clampScore(value.score),
      progress: clampProgress(value.progress),
      updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : new Date().toISOString(),
    };
  }
  const next: ListStoreV1 = { version: CURRENT_LIST_VERSION, entries };
  saveStore(next);
  return next;
}
```

Ensure `LIST_STATUSES` and `CURRENT_LIST_VERSION` are imported from `./schema` at the top of the file (add to the existing import if missing).

- [ ] **Step 4: Add `replaceStore` to `src/lib/list/reactive.ts`**

Import it and add the reactive wrapper next to `importEntries`:

```ts
import { loadStore, upsertEntry, removeEntry, bulkUpsert, replaceStore as persistReplace, type BulkImportItem } from "./storage";

export function replaceStore(store: ListStoreV1): void {
  snapshot = persistReplace(store);
  emit();
}
```

(Adjust the existing `./storage` import line to include `replaceStore as persistReplace`. `snapshot`/`emit` already exist in this module.)

- [ ] **Step 5: Run to verify it passes**

Run: `npm test -- list/__tests__/replace`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/list/storage.ts src/lib/list/reactive.ts src/lib/list/__tests__/replace.test.ts
git commit -m "feat: add replaceStore that preserves entry timestamps"
```

---

### Task 3: Supabase clients & config guard

**Files:**
- Modify: `package.json` (add deps)
- Create: `src/lib/supabase/client.ts`
- Create: `src/lib/supabase/server.ts`
- Test: `src/lib/supabase/__tests__/config.test.ts`

**Interfaces:**
- Produces:
  - `function isSupabaseConfigured(): boolean` — true iff both env vars are non-empty.
  - `function supabaseBrowser(): SupabaseClient` — memoized browser client (throws if unconfigured; callers guard with `isSupabaseConfigured()`).
  - `async function supabaseServer(): Promise<SupabaseClient>` — server client bound to Next cookies (used by the auth callback).

- [ ] **Step 1: Install dependencies**

```bash
npm install @supabase/supabase-js @supabase/ssr
```

- [ ] **Step 2: Write the failing test at `src/lib/supabase/__tests__/config.test.ts`**

```ts
import { describe, it, expect, afterEach, vi } from "vitest";

async function freshConfig() {
  vi.resetModules();
  return await import("@/lib/supabase/client");
}

describe("isSupabaseConfigured", () => {
  afterEach(() => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  });

  it("is false when env vars are absent", async () => {
    const { isSupabaseConfigured } = await freshConfig();
    expect(isSupabaseConfigured()).toBe(false);
  });

  it("is true when both env vars are present", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://x.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
    const { isSupabaseConfigured } = await freshConfig();
    expect(isSupabaseConfigured()).toBe(true);
  });
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `npm test -- supabase/__tests__/config`
Expected: FAIL — cannot find module `@/lib/supabase/client`.

- [ ] **Step 4: Implement `src/lib/supabase/client.ts`**

```ts
import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

const URL = () => process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const KEY = () => process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

export function isSupabaseConfigured(): boolean {
  return URL().length > 0 && KEY().length > 0;
}

let cached: SupabaseClient | null = null;

export function supabaseBrowser(): SupabaseClient {
  if (!isSupabaseConfigured()) throw new Error("Supabase is not configured");
  if (!cached) cached = createBrowserClient(URL(), KEY());
  return cached;
}
```

- [ ] **Step 5: Implement `src/lib/supabase/server.ts`**

```ts
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isSupabaseConfigured } from "./client";

export async function supabaseServer(): Promise<SupabaseClient> {
  if (!isSupabaseConfigured()) throw new Error("Supabase is not configured");
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (toSet) => {
          try {
            toSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
          } catch {
            // called from a Server Component render — safe to ignore.
          }
        },
      },
    }
  );
}
```

- [ ] **Step 6: Run to verify it passes**

Run: `npm test -- supabase/__tests__/config`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json src/lib/supabase/client.ts src/lib/supabase/server.ts src/lib/supabase/__tests__/config.test.ts
git commit -m "feat: add Supabase browser/server clients and config guard"
```

---

### Task 4: Cloud list helpers (pull + reconcile)

**Files:**
- Create: `src/lib/sync/cloud.ts`
- Test: `src/lib/sync/__tests__/cloud.test.ts`

**Interfaces:**
- Consumes: `CloudRow`, `entryToRow` (merge.ts); `ListStoreV1`; a Supabase-like client.
- Produces:
  - `async function pullCloud(supabase: SupaLike, userId: string): Promise<CloudRow[]>` — select all `list_entries` rows for the user.
  - `async function reconcileCloud(supabase: SupaLike, userId: string, store: ListStoreV1): Promise<void>` — upsert every current entry (as a row) and delete cloud rows whose `media_id` is not in the store.
  - `interface SupaLike { from(table: string): any }` — narrow structural type so tests can pass a mock.

- [ ] **Step 1: Write the failing test at `src/lib/sync/__tests__/cloud.test.ts`**

```ts
import { describe, it, expect, vi } from "vitest";
import { pullCloud, reconcileCloud } from "@/lib/sync/cloud";
import type { ListStoreV1 } from "@/lib/list/schema";

function makeSupa() {
  const calls: Record<string, unknown[]> = { upsert: [], deleteNotIn: [] };
  const api = {
    from: () => api,
    select: () => ({ eq: async () => ({ data: [{ user_id: "u1", media_id: 7, status: "watching", score: null, progress: 2, updated_at: "2026-01-01T00:00:00.000Z" }], error: null }) }),
    upsert: (rows: unknown) => { calls.upsert.push(rows); return { error: null }; },
    delete: () => ({
      eq: () => ({
        not: (col: string, op: string, val: unknown) => { calls.deleteNotIn.push([col, op, val]); return Promise.resolve({ error: null }); },
        // when the store is empty we delete all rows for the user (eq only)
        then: (res: (v: { error: null }) => void) => res({ error: null }),
      }),
    }),
    _calls: calls,
  };
  return api;
}

describe("pullCloud", () => {
  it("returns the user's rows", async () => {
    const supa = makeSupa();
    const rows = await pullCloud(supa as never, "u1");
    expect(rows[0].media_id).toBe(7);
  });
});

describe("reconcileCloud", () => {
  it("upserts current entries and deletes rows not in the store", async () => {
    const supa = makeSupa();
    const store: ListStoreV1 = { version: 1, entries: {
      7: { status: "completed", score: 8, progress: 12, updatedAt: "2026-02-01T00:00:00.000Z" },
    } };
    await reconcileCloud(supa as never, "u1", store);
    expect((supa._calls.upsert[0] as unknown[]).length).toBe(1);
    // deletes rows whose media_id is not in [7]
    expect(supa._calls.deleteNotIn[0]).toEqual(["media_id", "in", "(7)"]);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- sync/__tests__/cloud`
Expected: FAIL — cannot find module `@/lib/sync/cloud`.

- [ ] **Step 3: Implement `src/lib/sync/cloud.ts`**

```ts
import type { ListStoreV1 } from "@/lib/list/schema";
import type { CloudRow } from "./merge";
import { entryToRow } from "./merge";

// Narrow structural type — the real Supabase client satisfies it.
export interface SupaLike {
  from(table: string): any; // eslint-disable-line @typescript-eslint/no-explicit-any
}

const TABLE = "list_entries";

export async function pullCloud(supabase: SupaLike, userId: string): Promise<CloudRow[]> {
  const { data, error } = await supabase.from(TABLE).select("*").eq("user_id", userId);
  if (error) throw error;
  return (data ?? []) as CloudRow[];
}

export async function reconcileCloud(
  supabase: SupaLike,
  userId: string,
  store: ListStoreV1
): Promise<void> {
  const rows = Object.entries(store.entries).map(([id, entry]) =>
    entryToRow(userId, Number(id), entry)
  );

  if (rows.length > 0) {
    const up = await supabase.from(TABLE).upsert(rows, { onConflict: "user_id,media_id" });
    if (up?.error) throw up.error;
    const ids = rows.map((r) => r.media_id).join(",");
    const del = await supabase
      .from(TABLE)
      .delete()
      .eq("user_id", userId)
      .not("media_id", "in", `(${ids})`);
    if (del?.error) throw del.error;
  } else {
    const del = await supabase.from(TABLE).delete().eq("user_id", userId);
    if (del?.error) throw del.error;
  }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- sync/__tests__/cloud`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/sync/cloud.ts src/lib/sync/__tests__/cloud.test.ts
git commit -m "feat: add cloud pull + reconcile helpers"
```

---

### Task 5: Auth context + SyncProvider

**Files:**
- Create: `src/components/SyncProvider.tsx`
- Modify: `src/app/layout.tsx` (mount `<SyncProvider>` around content)
- Test: `src/components/__tests__/SyncProvider.test.tsx`

**Interfaces:**
- Consumes: `isSupabaseConfigured`, `supabaseBrowser` (supabase/client); `pullCloud`, `reconcileCloud` (cloud.ts); `mergeLists` (merge.ts); `getSnapshot`, `subscribe`, `replaceStore` (reactive.ts).
- Produces:
  - `interface AuthState { user: { email: string | null; avatarUrl: string | null } | null; configured: boolean; signIn: () => void; signOut: () => Promise<void>; }`
  - `function useAuth(): AuthState` (context hook).
  - `function SyncProvider({ children }): JSX.Element` — provides `useAuth`; on sign-in: `pullCloud` → `mergeLists(getSnapshot(), rows)` → `replaceStore(merged)` → `reconcileCloud(...)`; while signed in, subscribes to the store and debounces `reconcileCloud` (1s). When unconfigured, renders children and exposes `{ user: null, configured: false }`.

- [ ] **Step 1: Write the failing test at `src/components/__tests__/SyncProvider.test.tsx`**

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

// Unconfigured Supabase → provider is inert but renders children and reports configured=false.
vi.mock("@/lib/supabase/client", () => ({
  isSupabaseConfigured: () => false,
  supabaseBrowser: () => { throw new Error("not configured"); },
}));

import { SyncProvider, useAuth } from "@/components/SyncProvider";

function Probe() {
  const { configured, user } = useAuth();
  return <div>configured:{String(configured)} user:{user ? "yes" : "no"}</div>;
}

describe("SyncProvider (unconfigured)", () => {
  beforeEach(() => { localStorage.clear(); });

  it("renders children and reports not-configured without touching Supabase", () => {
    render(<SyncProvider><Probe /></SyncProvider>);
    expect(screen.getByText(/configured:false user:no/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- SyncProvider`
Expected: FAIL — cannot find module `@/components/SyncProvider`.

- [ ] **Step 3: Implement `src/components/SyncProvider.tsx`**

```tsx
"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";
import { isSupabaseConfigured, supabaseBrowser } from "@/lib/supabase/client";
import { getSnapshot, subscribe, replaceStore } from "@/lib/list/reactive";
import { mergeLists } from "@/lib/sync/merge";
import { pullCloud, reconcileCloud } from "@/lib/sync/cloud";

interface AuthUser { email: string | null; avatarUrl: string | null; }
interface AuthState {
  user: AuthUser | null;
  configured: boolean;
  signIn: () => void;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AuthState>({
  user: null, configured: false, signIn: () => {}, signOut: async () => {},
});

export function useAuth(): AuthState {
  return useContext(Ctx);
}

export function SyncProvider({ children }: { children: React.ReactNode }) {
  const configured = isSupabaseConfigured();
  const [user, setUser] = useState<AuthUser | null>(null);
  const userIdRef = useRef<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!configured) return;
    const supabase = supabaseBrowser();
    let unsubStore: (() => void) | null = null;

    async function onSignedIn(userId: string, u: AuthUser) {
      userIdRef.current = userId;
      setUser(u);
      try {
        const rows = await pullCloud(supabase, userId);
        const merged = mergeLists(getSnapshot(), rows);
        replaceStore(merged);
        await reconcileCloud(supabase, userId, merged);
      } catch {
        // sync failure is non-fatal; local store keeps working.
      }
      unsubStore?.();
      unsubStore = subscribe(() => {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => {
          const uid = userIdRef.current;
          if (uid) reconcileCloud(supabase, uid, getSnapshot()).catch(() => {});
        }, 1000);
      });
    }

    function onSignedOut() {
      userIdRef.current = null;
      setUser(null);
      unsubStore?.();
      unsubStore = null;
    }

    supabase.auth.getUser().then(({ data }) => {
      if (data.user) {
        onSignedIn(data.user.id, {
          email: data.user.email ?? null,
          avatarUrl: (data.user.user_metadata?.avatar_url as string) ?? null,
        });
      }
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        onSignedIn(session.user.id, {
          email: session.user.email ?? null,
          avatarUrl: (session.user.user_metadata?.avatar_url as string) ?? null,
        });
      } else {
        onSignedOut();
      }
    });

    return () => { sub.subscription.unsubscribe(); unsubStore?.(); };
  }, [configured]);

  function signIn() {
    if (!configured) return;
    supabaseBrowser().auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
  }

  async function signOut() {
    if (!configured) return;
    await supabaseBrowser().auth.signOut();
  }

  return <Ctx.Provider value={{ user, configured, signIn, signOut }}>{children}</Ctx.Provider>;
}
```

- [ ] **Step 4: Mount it in `src/app/layout.tsx`**

Wrap the body content:

```tsx
import { SyncProvider } from "@/components/SyncProvider";
```
Change the body children to:
```tsx
<SyncProvider>
  <Navbar />
  <main className="flex-1 pb-24 sm:pb-0">{children}</main>
  <footer ...> ... </footer>
</SyncProvider>
```
(Keep the existing `<Navbar/>`, `<main>`, and `<footer>` exactly; only wrap them in `<SyncProvider>`.)

- [ ] **Step 5: Run tests + typecheck + build**

Run: `npm test -- SyncProvider`
Expected: PASS.

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `npm run build`
Expected: build succeeds (unconfigured mode is fine — no env vars needed to build).

- [ ] **Step 6: Commit**

```bash
git add src/components/SyncProvider.tsx src/app/layout.tsx src/components/__tests__/SyncProvider.test.tsx
git commit -m "feat: add auth context + cloud SyncProvider"
```

---

### Task 6: Auth button, callback route & navbar wiring

**Files:**
- Create: `src/app/auth/callback/route.ts`
- Create: `src/components/AuthButton.tsx`
- Modify: `src/components/Navbar.tsx` (replace the static chip with `<AuthButton />`)
- Test: `src/components/__tests__/AuthButton.test.tsx`

**Interfaces:**
- Consumes: `useAuth` (SyncProvider); `supabaseServer` (supabase/server).
- Produces:
  - `AuthButton()` — signed out & configured → "Sign in" button (calls `signIn`); signed in → avatar/email + "SYNCED · CLOUD" + a sign-out control; unconfigured → the static "SYNCED · LOCAL" chip (today's behavior).
  - `GET(request)` at `/auth/callback` — exchanges the `?code` for a session, redirects to `/`.

- [ ] **Step 1: Write the failing test at `src/components/__tests__/AuthButton.test.tsx`**

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const signIn = vi.fn();
let mockState = { user: null as null | { email: string | null; avatarUrl: string | null }, configured: true, signIn, signOut: vi.fn() };
vi.mock("@/components/SyncProvider", () => ({ useAuth: () => mockState }));

import { AuthButton } from "@/components/AuthButton";

describe("AuthButton", () => {
  it("shows Sign in when configured and signed out", () => {
    mockState = { ...mockState, user: null, configured: true };
    render(<AuthButton />);
    expect(screen.getByRole("button", { name: /sign in/i })).toBeInTheDocument();
  });

  it("shows the cloud-synced state when signed in", () => {
    mockState = { ...mockState, user: { email: "a@b.com", avatarUrl: null }, configured: true };
    render(<AuthButton />);
    expect(screen.getByText(/synced · cloud/i)).toBeInTheDocument();
  });

  it("falls back to the local chip when unconfigured", () => {
    mockState = { ...mockState, user: null, configured: false };
    render(<AuthButton />);
    expect(screen.getByText(/synced · local/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- AuthButton`
Expected: FAIL — cannot find module `@/components/AuthButton`.

- [ ] **Step 3: Implement `src/components/AuthButton.tsx`**

```tsx
"use client";

import { useAuth } from "@/components/SyncProvider";

export function AuthButton() {
  const { user, configured, signIn, signOut } = useAuth();

  if (!configured) {
    return (
      <div className="mono flex items-center gap-2 rounded-full border border-border-strong px-3.5 py-2 text-[11px] text-muted-foreground">
        <span className="pulse-dot h-1.5 w-1.5 rounded-full bg-violet" />
        <span>SYNCED · LOCAL</span>
      </div>
    );
  }

  if (!user) {
    return (
      <button
        type="button"
        onClick={signIn}
        className="rounded-full bg-foreground px-4 py-2 text-[12px] font-extrabold text-background transition-colors hover:bg-pink"
      >
        Sign in
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2.5">
      <div className="mono hidden items-center gap-2 rounded-full border border-border-strong px-3.5 py-2 text-[11px] text-muted-foreground sm:flex">
        <span className="pulse-dot h-1.5 w-1.5 rounded-full bg-pink" />
        <span>SYNCED · CLOUD</span>
      </div>
      <button
        type="button"
        onClick={() => signOut()}
        title={user.email ?? "Signed in"}
        className="grid h-8 w-8 place-items-center rounded-full bg-gradient-to-br from-pink to-violet text-[12px] font-black text-on-accent"
      >
        {(user.email ?? "?").slice(0, 1).toUpperCase()}
      </button>
    </div>
  );
}
```

- [ ] **Step 4: Implement `src/app/auth/callback/route.ts`**

```ts
import { NextResponse } from "next/server";
import { isSupabaseConfigured } from "@/lib/supabase/client";
import { supabaseServer } from "@/lib/supabase/server";

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  if (code && isSupabaseConfigured()) {
    const supabase = await supabaseServer();
    await supabase.auth.exchangeCodeForSession(code);
  }
  return NextResponse.redirect(new URL("/", url.origin));
}
```

- [ ] **Step 5: Wire the navbar**

In `src/components/Navbar.tsx`, replace the static "SYNCED · LOCAL" chip block (the `<div className="ml-auto flex items-center gap-3">…</div>` containing the chip) with:

```tsx
import { AuthButton } from "@/components/AuthButton";
```
and, in place of the old chip:
```tsx
<div className="ml-auto flex items-center gap-3">
  <AuthButton />
</div>
```

- [ ] **Step 6: Run tests + typecheck + build**

Run: `npm test`
Expected: all PASS (existing + new).

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `npm run build`
Expected: build succeeds; `/auth/callback` route compiles.

- [ ] **Step 7: Commit**

```bash
git add src/app/auth/callback/route.ts src/components/AuthButton.tsx src/components/Navbar.tsx src/components/__tests__/AuthButton.test.tsx
git commit -m "feat: add auth button, OAuth callback, and navbar wiring"
```

---

### Task 7: DB migration & setup documentation

**Files:**
- Create: `supabase/migrations/0001_list_entries.sql`
- Create: `docs/SUPABASE_SETUP.md`
- Modify: `.env.local.example` (create if absent)

**Interfaces:**
- Produces: the SQL applied to Supabase (via the connected Supabase tools during the integration step) and the click-by-click setup doc for the human steps.

- [ ] **Step 1: Create `supabase/migrations/0001_list_entries.sql`**

```sql
create table if not exists public.list_entries (
  user_id    uuid        not null references auth.users(id) on delete cascade,
  media_id   integer     not null,
  status     text        not null,
  score      integer,
  progress   integer     not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, media_id)
);

alter table public.list_entries enable row level security;

drop policy if exists "own rows" on public.list_entries;
create policy "own rows" on public.list_entries
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
```

- [ ] **Step 2: Create `.env.local.example`**

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
```

- [ ] **Step 3: Create `docs/SUPABASE_SETUP.md`**

```markdown
# Supabase + Google sign-in setup

One-time steps to enable optional login + cloud sync. The app works fully
without these (local-only mode); the sign-in button appears once the env vars
are set.

## 1. Supabase project
- A project is created and the `list_entries` migration
  (`supabase/migrations/0001_list_entries.sql`) is applied.
- Copy the project's **URL** and **anon public key** (Project Settings → API).

## 2. Env vars
Add to `.env.local` (local dev) and to Vercel (Project → Settings → Environment
Variables), then redeploy:
```
NEXT_PUBLIC_SUPABASE_URL=<your project url>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<your anon public key>
```

## 3. Google OAuth
1. Google Cloud Console → APIs & Services → Credentials → Create OAuth client ID
   (type: Web application).
2. Authorized redirect URI: `https://<project-ref>.supabase.co/auth/v1/callback`.
3. Copy the client ID + secret into Supabase → Authentication → Providers →
   Google, and enable it.

## 4. Auth redirect URLs (Supabase → Authentication → URL Configuration)
- Site URL: your production URL (e.g. `https://animood-app.vercel.app`).
- Additional redirect URLs: `http://localhost:3000/auth/callback` and
  `https://animood-app.vercel.app/auth/callback`.
```

- [ ] **Step 4: Run the full suite, typecheck, and build**

Run: `npm test`
Expected: all PASS.

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0001_list_entries.sql docs/SUPABASE_SETUP.md .env.local.example
git commit -m "chore: add list_entries migration and Supabase setup docs"
```

---

## Post-plan integration (not a subagent task)

After the code lands, an interactive step (Claude + user) provisions the live
backend:
1. **Claude:** create the Supabase project and apply `0001_list_entries.sql` via
   the connected Supabase tools; retrieve the project URL + anon key.
2. **User:** create the Google OAuth client, paste ID/secret into Supabase's Google
   provider, add the two env vars to Vercel, and set the Auth redirect URLs
   (per `docs/SUPABASE_SETUP.md`).
3. Redeploy; verify sign-in + cross-device sync on the live URL.

## Self-Review Notes

- **Spec coverage:** anonymous-first + localStorage source of truth (spec §3) → the
  store is untouched when signed out; `SyncProvider` only acts when configured+signed
  in (Task 5). Merge LWW-by-updatedAt (spec §3) → Task 1. Data model + RLS (spec §4)
  → Task 7 migration. Auth + Google + callback + navbar chip (spec §5) → Tasks 5–6.
  Resilience: sync failures non-fatal, unconfigured fallback (spec §6) → try/catch in
  SyncProvider + `configured` guard everywhere (Tasks 5–6). External setup (spec §7) →
  Task 7 doc + post-plan integration. Testing (spec §8) → merge/replace/config/cloud
  unit tests + SyncProvider/AuthButton component tests; existing 132 stay green.
- **Timestamp preservation:** `replaceStore` (Task 2) deliberately does NOT stamp
  `updatedAt=now`, unlike `bulkUpsert` — required so merge results survive round-trips.
- **Type consistency:** `CloudRow` defined in Task 1 (`types.ts`, re-exported from
  `merge.ts`) and consumed by Tasks 4–5. `replaceStore` signatures match across
  storage (returns store) and reactive (void) per Task 2. `useAuth`/`AuthState`
  defined in Task 5 and consumed by Task 6.
- **Deferred:** Supabase Realtime, profiles, social, email/magic-link — all out of
  scope per spec §9.
