# Public Profiles Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship public, shareable user profiles at `/u/[username]` — username identity, a public stats + list view, and a favorites highlights row — as the first slice of Phase 3.

**Architecture:** A new `profiles` table (keyed by `auth.users.id`) with a chosen `username` and an `is_public` flag, plus public-read RLS on `profiles` and `list_entries`. Existing stats/list view components are refactored to take entries as input so they can render *another* user's data. The profile page is a server component that resolves public/private/not-found/owner state and reuses those boards. Favorites ride on the existing `list_entries` row as a boolean flag, threading through the local store and the Phase-2 cloud sync path unchanged in spirit (last-write-wins).

**Tech Stack:** Next.js 16 (App Router, RSC), TypeScript, Tailwind v4, Supabase (Postgres + RLS, `@supabase/ssr`), Vitest + Testing Library.

## Global Constraints

- **Node >= 22.4** (enforced by `engines`; tests set `NODE_OPTIONS=--no-experimental-webstorage`).
- **No new runtime dependencies** — reuse `@supabase/ssr`, `@supabase/supabase-js` already present.
- **Reads use the anon key under RLS only — no service-role key in the app.**
- **The signed-out / Supabase-unconfigured path must stay fully working** (local-only mode). Every new auth/profile code path must no-op when `isSupabaseConfigured()` is false.
- **Icons:** use the inline SVG set in `src/components/icons.tsx` — no emoji/char glyphs.
- **Page shell:** each page provides its own `mx-auto max-w-[1560px] px-6 sm:px-10` container (the layout `<main>` has none).
- **Existing 162 tests must stay green.**
- **Commit after every task** (frequent commits).

---

### Task 1: Database migration — `profiles` table, `is_favorite`, public-read RLS

**Files:**
- Create: `supabase/migrations/0002_profiles.sql`
- Apply to project ref `teerejvdaohbtlrxxcdo` via the Supabase `apply_migration` tool.

**Interfaces:**
- Produces (DB): table `public.profiles(user_id uuid pk, username citext unique, display_name text, avatar_url text, is_public bool default true, created_at timestamptz default now())`; column `public.list_entries.is_favorite bool not null default false`; SELECT policies allowing public reads.

- [ ] **Step 1: Write the migration file**

```sql
-- supabase/migrations/0002_profiles.sql
create extension if not exists citext;

create table if not exists public.profiles (
  user_id      uuid        not null references auth.users(id) on delete cascade,
  username     citext      not null unique,
  display_name text,
  avatar_url   text,
  is_public    boolean     not null default true,
  created_at   timestamptz not null default now(),
  primary key (user_id),
  constraint username_format check (username ~ '^[a-z0-9_]{3,20}$')
);

alter table public.profiles enable row level security;

drop policy if exists "public profiles readable" on public.profiles;
create policy "public profiles readable" on public.profiles
  for select using (is_public = true);

drop policy if exists "own profile readable" on public.profiles;
create policy "own profile readable" on public.profiles
  for select using (auth.uid() = user_id);

drop policy if exists "own profile writable" on public.profiles;
create policy "own profile writable" on public.profiles
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

alter table public.list_entries
  add column if not exists is_favorite boolean not null default false;

drop policy if exists "public list readable" on public.list_entries;
create policy "public list readable" on public.list_entries
  for select using (
    exists (
      select 1 from public.profiles p
      where p.user_id = list_entries.user_id and p.is_public = true
    )
  );
```

- [ ] **Step 2: Apply the migration** via the Supabase `apply_migration` tool (name `0002_profiles`, project_id `teerejvdaohbtlrxxcdo`).

- [ ] **Step 3: Verify** with the Supabase `list_tables` tool (verbose) — confirm `public.profiles` exists with the columns above and `list_entries.is_favorite` is present. Run `get_advisors` (security) and confirm no new "RLS disabled" / "policy allows all" errors were introduced (the pre-existing leaked-password WARN is expected and unrelated).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0002_profiles.sql
git commit -m "feat(db): profiles table, is_favorite column, public-read RLS"
```

---

### Task 2: Username validation library (pure)

**Files:**
- Create: `src/lib/profile/username.ts`
- Test: `src/lib/profile/__tests__/username.test.ts`

**Interfaces:**
- Produces:
  - `type UsernameError = "too_short" | "too_long" | "invalid_chars" | "reserved"`
  - `RESERVED_USERNAMES: Set<string>`
  - `normalizeUsername(raw: string): string` — trims and lowercases.
  - `validateUsername(raw: string): { ok: true; value: string } | { ok: false; error: UsernameError }` — normalizes first, then checks length (3–20), charset `[a-z0-9_]`, and reserved list.

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/profile/__tests__/username.test.ts
import { describe, it, expect } from "vitest";
import { normalizeUsername, validateUsername, RESERVED_USERNAMES } from "@/lib/profile/username";

describe("normalizeUsername", () => {
  it("trims and lowercases", () => {
    expect(normalizeUsername("  AzizDos  ")).toBe("azizdos");
  });
});

describe("validateUsername", () => {
  it("accepts a valid handle and returns the normalized value", () => {
    expect(validateUsername("Aziz_01")).toEqual({ ok: true, value: "aziz_01" });
  });
  it("rejects too short (<3)", () => {
    expect(validateUsername("ab")).toEqual({ ok: false, error: "too_short" });
  });
  it("rejects too long (>20)", () => {
    expect(validateUsername("a".repeat(21))).toEqual({ ok: false, error: "too_long" });
  });
  it("rejects invalid characters", () => {
    expect(validateUsername("bad name!")).toEqual({ ok: false, error: "invalid_chars" });
  });
  it("rejects reserved names case-insensitively", () => {
    expect(validateUsername("Admin")).toEqual({ ok: false, error: "reserved" });
    expect(RESERVED_USERNAMES.has("settings")).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/profile/__tests__/username.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/lib/profile/username.ts
export type UsernameError = "too_short" | "too_long" | "invalid_chars" | "reserved";

export const RESERVED_USERNAMES = new Set<string>([
  "api", "u", "admin", "settings", "auth", "welcome", "login", "logout",
  "signin", "signout", "search", "stats", "my-list", "mylist",
  "recommendations", "import", "media", "home", "about", "help", "support",
  "null", "undefined", "animood",
]);

export function normalizeUsername(raw: string): string {
  return raw.trim().toLowerCase();
}

export function validateUsername(
  raw: string
): { ok: true; value: string } | { ok: false; error: UsernameError } {
  const value = normalizeUsername(raw);
  if (value.length < 3) return { ok: false, error: "too_short" };
  if (value.length > 20) return { ok: false, error: "too_long" };
  if (!/^[a-z0-9_]+$/.test(value)) return { ok: false, error: "invalid_chars" };
  if (RESERVED_USERNAMES.has(value)) return { ok: false, error: "reserved" };
  return { ok: true, value };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/profile/__tests__/username.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/profile/username.ts src/lib/profile/__tests__/username.test.ts
git commit -m "feat(profile): username validation library"
```

---

### Task 3: Profile types + data-access queries (mocked Supabase)

**Files:**
- Create: `src/lib/profile/types.ts`
- Create: `src/lib/profile/queries.ts`
- Test: `src/lib/profile/__tests__/queries.test.ts`

**Interfaces:**
- Consumes: `SupaLike` from `@/lib/sync/cloud`, `validateUsername` from Task 2.
- Produces:
  - `interface Profile { userId: string; username: string; displayName: string | null; avatarUrl: string | null; isPublic: boolean; createdAt: string }`
  - `profileRowToProfile(row): Profile`
  - `getProfileByUsername(supabase: SupaLike, username: string): Promise<Profile | null>`
  - `getProfileByUserId(supabase: SupaLike, userId: string): Promise<Profile | null>`
  - `createProfile(supabase, input: { userId: string; username: string; displayName: string | null; avatarUrl: string | null }): Promise<{ ok: true; profile: Profile } | { ok: false; error: "taken" | "invalid" | "unknown" }>`
  - `setProfileVisibility(supabase: SupaLike, userId: string, isPublic: boolean): Promise<void>`

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/profile/__tests__/queries.test.ts
import { describe, it, expect, vi } from "vitest";
import {
  getProfileByUsername, createProfile, setProfileVisibility,
} from "@/lib/profile/queries";

const ROW = {
  user_id: "u1", username: "aziz", display_name: "Aziz",
  avatar_url: null, is_public: true, created_at: "2026-08-20T00:00:00.000Z",
};

function fakeSupabase(handlers: Record<string, unknown>) {
  return { from: () => handlers } as never;
}

describe("getProfileByUsername", () => {
  it("maps a row to a Profile", async () => {
    const q = {
      select: () => q, eq: () => q,
      maybeSingle: async () => ({ data: ROW, error: null }),
    };
    const profile = await getProfileByUsername(fakeSupabase(q), "Aziz");
    expect(profile).toEqual({
      userId: "u1", username: "aziz", displayName: "Aziz",
      avatarUrl: null, isPublic: true, createdAt: "2026-08-20T00:00:00.000Z",
    });
  });
  it("returns null when not found", async () => {
    const q = {
      select: () => q, eq: () => q,
      maybeSingle: async () => ({ data: null, error: null }),
    };
    expect(await getProfileByUsername(fakeSupabase(q), "nope")).toBeNull();
  });
});

describe("createProfile", () => {
  it("maps a Postgres unique-violation (23505) to 'taken'", async () => {
    const q = {
      insert: () => q, select: () => q,
      maybeSingle: async () => ({ data: null, error: { code: "23505" } }),
    };
    const res = await createProfile(fakeSupabase(q), {
      userId: "u1", username: "taken", displayName: null, avatarUrl: null,
    });
    expect(res).toEqual({ ok: false, error: "taken" });
  });
  it("rejects an invalid username without hitting the DB", async () => {
    const from = vi.fn();
    const res = await createProfile({ from } as never, {
      userId: "u1", username: "!!", displayName: null, avatarUrl: null,
    });
    expect(res).toEqual({ ok: false, error: "invalid" });
    expect(from).not.toHaveBeenCalled();
  });
});

describe("setProfileVisibility", () => {
  it("throws when the update errors", async () => {
    const q = { update: () => q, eq: async () => ({ error: { message: "x" } }) };
    await expect(setProfileVisibility(fakeSupabase(q), "u1", false)).rejects.toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/profile/__tests__/queries.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/lib/profile/types.ts
export interface Profile {
  userId: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  isPublic: boolean;
  createdAt: string;
}
```

```typescript
// src/lib/profile/queries.ts
import type { SupaLike } from "@/lib/sync/cloud";
import type { Profile } from "./types";
import { validateUsername } from "./username";

const TABLE = "profiles";

interface ProfileRow {
  user_id: string; username: string; display_name: string | null;
  avatar_url: string | null; is_public: boolean; created_at: string;
}

export function profileRowToProfile(row: ProfileRow): Profile {
  return {
    userId: row.user_id, username: row.username, displayName: row.display_name,
    avatarUrl: row.avatar_url, isPublic: row.is_public, createdAt: row.created_at,
  };
}

export async function getProfileByUsername(supabase: SupaLike, username: string): Promise<Profile | null> {
  const { data, error } = await supabase.from(TABLE)
    .select("*").eq("username", username.trim().toLowerCase()).maybeSingle();
  if (error) throw error;
  return data ? profileRowToProfile(data as ProfileRow) : null;
}

export async function getProfileByUserId(supabase: SupaLike, userId: string): Promise<Profile | null> {
  const { data, error } = await supabase.from(TABLE)
    .select("*").eq("user_id", userId).maybeSingle();
  if (error) throw error;
  return data ? profileRowToProfile(data as ProfileRow) : null;
}

export async function createProfile(
  supabase: SupaLike,
  input: { userId: string; username: string; displayName: string | null; avatarUrl: string | null }
): Promise<{ ok: true; profile: Profile } | { ok: false; error: "taken" | "invalid" | "unknown" }> {
  const check = validateUsername(input.username);
  if (!check.ok) return { ok: false, error: "invalid" };
  const { data, error } = await supabase.from(TABLE).insert({
    user_id: input.userId, username: check.value,
    display_name: input.displayName, avatar_url: input.avatarUrl,
  }).select("*").maybeSingle();
  if (error) {
    if ((error as { code?: string }).code === "23505") return { ok: false, error: "taken" };
    return { ok: false, error: "unknown" };
  }
  return { ok: true, profile: profileRowToProfile(data as ProfileRow) };
}

export async function setProfileVisibility(supabase: SupaLike, userId: string, isPublic: boolean): Promise<void> {
  const { error } = await supabase.from(TABLE).update({ is_public: isPublic }).eq("user_id", userId);
  if (error) throw error;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/profile/__tests__/queries.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/profile/
git commit -m "feat(profile): Profile type + data-access queries"
```

---

### Task 4: Favorites plumbing — `is_favorite` through store + sync

**Files:**
- Modify: `src/lib/list/schema.ts` (add `isFavorite` to `ListEntry`, validate/sanitize, default false)
- Modify: `src/lib/list/storage.ts` (`upsertEntry` carries `isFavorite`)
- Modify: `src/lib/sync/types.ts` (`CloudRow.is_favorite`)
- Modify: `src/lib/sync/merge.ts` (`rowToEntry` / `entryToRow` map `isFavorite`)
- Modify: `src/components/ListEditor.tsx` (favorite toggle button)
- Test: `src/lib/list/__tests__/schema.test.ts` (extend), `src/lib/sync/__tests__/merge.test.ts` (extend)

**Interfaces:**
- Produces: `ListEntry.isFavorite: boolean`; `CloudRow.is_favorite: boolean`; `setEntry(id, { isFavorite })` persists it; merge/mappers round-trip it.
- Consumed by: Task 5 (highlights filter), Task 9 (highlights row).

**Backward-compat rule:** entries/rows missing the field are read as `isFavorite: false`. `isValidEntry` must NOT reject an entry that lacks `isFavorite` (older localStorage data), and must reject a non-boolean when present.

- [ ] **Step 1: Write the failing tests**

```typescript
// add to src/lib/list/__tests__/schema.test.ts
import { sanitizeStore } from "@/lib/list/schema";

it("defaults isFavorite to false when absent (back-compat)", () => {
  const store = sanitizeStore({
    version: 1,
    entries: { 5: { status: "completed", score: 9, progress: 12, updatedAt: "2026-01-01T00:00:00Z" } },
  });
  expect(store.entries[5].isFavorite).toBe(false);
});

it("preserves isFavorite=true", () => {
  const store = sanitizeStore({
    version: 1,
    entries: { 5: { status: "completed", score: 9, progress: 12, updatedAt: "2026-01-01T00:00:00Z", isFavorite: true } },
  });
  expect(store.entries[5].isFavorite).toBe(true);
});
```

```typescript
// add to src/lib/sync/__tests__/merge.test.ts
import { entryToRow, rowToEntry } from "@/lib/sync/merge";

it("round-trips isFavorite through the row mappers", () => {
  const row = entryToRow("u1", 7, {
    status: "watching", score: null, progress: 3, updatedAt: "2026-01-01T00:00:00Z", isFavorite: true,
  });
  expect(row.is_favorite).toBe(true);
  expect(rowToEntry(row).entry.isFavorite).toBe(true);
});

it("defaults isFavorite to false when the row omits it", () => {
  const { entry } = rowToEntry({
    user_id: "u1", media_id: 7, status: "watching", score: null, progress: 3,
    updated_at: "2026-01-01T00:00:00Z",
  } as never);
  expect(entry.isFavorite).toBe(false);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/lib/list/__tests__/schema.test.ts src/lib/sync/__tests__/merge.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

In `src/lib/list/schema.ts`: add `isFavorite: boolean;` to `ListEntry`; in `isValidEntry`, after the `updatedAt` check add `if (e.isFavorite !== undefined && typeof e.isFavorite !== "boolean") return false;`; in `sanitizeStore`'s entry copy set `isFavorite: candidate.isFavorite === true` (coerce absent → false). Do the same normalization in `isValidStore` path is not needed (it only booleans-checks). Ensure `sanitizeStore` writes the coerced entry, not the raw candidate:

```typescript
// inside sanitizeStore loop, replace `entries[Number(key)] = candidate;`
if (isValidEntry(candidate)) {
  entries[Number(key)] = { ...candidate, isFavorite: (candidate as ListEntry).isFavorite === true };
}
```

In `src/lib/list/storage.ts` `upsertEntry`, add to `merged`: `isFavorite: patch.isFavorite ?? existing?.isFavorite ?? false,` and widen the `patch` type is already `Partial<Omit<ListEntry,"updatedAt">>` so `isFavorite` is allowed automatically. In `bulkUpsert` set `isFavorite: false` on imported items; in `replaceStore` copy `isFavorite: value.isFavorite === true`.

In `src/lib/sync/types.ts` add `is_favorite: boolean;` to `CloudRow`.

In `src/lib/sync/merge.ts`: `rowToEntry` sets `isFavorite: row.is_favorite === true`; `entryToRow` sets `is_favorite: entry.isFavorite === true`.

In `src/lib/sync/cloud.ts` no change needed — `entryToRow` now includes `is_favorite`, so the upsert column set already carries it.

In `src/components/ListEditor.tsx`: add a favorite toggle button (use `StarIcon` from `@/components/icons` if present, else a text star) inside the editing block:

```tsx
<button
  type="button"
  aria-pressed={entry.isFavorite}
  aria-label={entry.isFavorite ? "Unfavorite" : "Favorite"}
  onClick={() => setEntry(mediaId, { isFavorite: !entry.isFavorite })}
  className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${
    entry.isFavorite ? "border-pink bg-pink/10 text-pink" : "border-border text-muted-foreground hover:border-foreground"
  }`}
>
  {entry.isFavorite ? "★ Favorited" : "☆ Favorite"}
</button>
```

(If `src/components/icons.tsx` has no star, keep the ★/☆ text — it is a control label, not an icon glyph in the list, and avoids adding an icon. Confirm against the icon set; prefer an icon if one exists.)

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/lib/list src/lib/sync`
Expected: PASS. Then run the full suite `npm test` — all previously-green tests still pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/list src/lib/sync src/components/ListEditor.tsx
git commit -m "feat(list): is_favorite flag through store, sync mappers, and editor"
```

---

### Task 5: Refactor stats & list views to take entries as input

**Files:**
- Create: `src/components/StatsBoard.tsx` (presentational; the current StatsView body, driven by an `entries` prop)
- Modify: `src/components/StatsView.tsx` (thin wrapper: reads store, renders `StatsBoard`)
- Create: `src/components/MediaList.tsx` (presentational; the current MyListView body, `entries` + `interactive` props)
- Modify: `src/components/MyListView.tsx` (thin wrapper)
- Test: `src/components/__tests__/StatsBoard.test.tsx`, `src/components/__tests__/MediaList.test.tsx`; keep existing `MyListView.test.tsx` green.

**Interfaces:**
- Consumes: `ListEntry` map, `is_favorite` (Task 4).
- Produces:
  - `StatsBoard({ entries, showShareCard = true }: { entries: Record<number, ListEntry>; showShareCard?: boolean })`
  - `MediaList({ entries, interactive = true }: { entries: Record<number, ListEntry>; interactive?: boolean })`
- Consumed by: Task 9 (profile page passes owner entries, `showShareCard={false}`, `interactive={false}`).

- [ ] **Step 1: Write the failing tests**

```tsx
// src/components/__tests__/MediaList.test.tsx
import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MediaList } from "@/components/MediaList";
import type { ListEntry } from "@/lib/list/schema";

const entry = (o: Partial<ListEntry> = {}): ListEntry => ({
  status: "completed", score: 8, progress: 12, updatedAt: "2026-01-01T00:00:00Z", isFavorite: false, ...o,
});

beforeEach(() => {
  global.fetch = vi.fn(async () => ({
    ok: true, json: async () => ({ items: [{ id: 1, title: "Cowboy Bebop", type: "ANIME", coverImage: null, episodes: 26 }] }),
  })) as never;
});

describe("MediaList", () => {
  it("renders rows from the entries prop", async () => {
    render(<MediaList entries={{ 1: entry() }} interactive={false} />);
    expect(await screen.findByText("Cowboy Bebop")).toBeInTheDocument();
  });
  it("hides the +1 control when interactive is false", async () => {
    render(<MediaList entries={{ 1: entry() }} interactive={false} />);
    await screen.findByText("Cowboy Bebop");
    expect(screen.queryByRole("button", { name: "Add one" })).toBeNull();
  });
  it("shows an empty state for no entries", () => {
    render(<MediaList entries={{}} interactive={false} />);
    expect(screen.getByText(/no titles/i)).toBeInTheDocument();
  });
});
```

```tsx
// src/components/__tests__/StatsBoard.test.tsx
import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { StatsBoard } from "@/components/StatsBoard";
import type { ListEntry } from "@/lib/list/schema";

beforeEach(() => {
  global.fetch = vi.fn(async () => ({
    ok: true, json: async () => ({ items: [{ id: 1, title: "X", type: "ANIME", genres: ["Action"], episodes: 12, coverImage: null }] }),
  })) as never;
});

const e: ListEntry = { status: "completed", score: 9, progress: 12, updatedAt: "2026-01-01T00:00:00Z", isFavorite: false };

describe("StatsBoard", () => {
  it("renders stat tiles from the entries prop", async () => {
    render(<StatsBoard entries={{ 1: e }} />);
    expect(await screen.findByText("Titles")).toBeInTheDocument();
  });
  it("hides the share card control when showShareCard is false", async () => {
    render(<StatsBoard entries={{ 1: e }} showShareCard={false} />);
    await screen.findByText("Titles");
    expect(screen.queryByText(/create share card/i)).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/components/__tests__/MediaList.test.tsx src/components/__tests__/StatsBoard.test.tsx`
Expected: FAIL (modules not found).

- [ ] **Step 3: Implement the extraction**

Move the body of `StatsView` (the media fetch + all rendering) into `StatsBoard.tsx`, changing the data source from `useListStore()` to the `entries` prop:
- Replace `const store = useListStore();` with `const entries = props.entries;` and `const ids = Object.keys(entries).map(Number);`.
- Everywhere `store.entries` was used, use `entries`.
- Wrap the "Share your stats" `<Section>` in `{showShareCard && (...)}`.
- `StatsView.tsx` becomes:

```tsx
"use client";
import { useListStore } from "@/lib/list/reactive";
import { StatsBoard } from "@/components/StatsBoard";
export function StatsView() {
  const store = useListStore();
  return <StatsBoard entries={store.entries} />;
}
```

Do the analogous move for `MediaList.tsx` from `MyListView`:
- Props `{ entries, interactive = true }`. Replace `const store = useListStore();` with `const store = { version: 1 as const, entries };` so `groupIdsByStatus(store)` keeps working unchanged.
- Guard the `+1` button with `{interactive && (...)}`.
- `MyListView.tsx` becomes a wrapper:

```tsx
"use client";
import { useListStore } from "@/lib/list/reactive";
import { MediaList } from "@/components/MediaList";
export function MyListView() {
  const store = useListStore();
  return <MediaList entries={store.entries} interactive />;
}
```

Keep the existing empty-state copy but ensure `MediaList`'s empty state includes the text "no titles" (adjust the existing empty copy to contain that phrase, or update the test to the existing copy — pick one and keep consistent). Preserve the MyList empty-state buttons in the `interactive` path.

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/components` then `npm test` (full suite green, including the existing `MyListView.test.tsx`).

- [ ] **Step 5: Commit**

```bash
git add src/components/StatsBoard.tsx src/components/StatsView.tsx src/components/MediaList.tsx src/components/MyListView.tsx src/components/__tests__/
git commit -m "refactor: StatsBoard/MediaList take entries as input; views become wrappers"
```

---

### Task 6: Auth context — expose username + needs-username

**Files:**
- Modify: `src/components/SyncProvider.tsx`
- Test: `src/components/__tests__/SyncProvider.username.test.tsx`

**Interfaces:**
- Consumes: `getProfileByUserId` (Task 3).
- Produces (on `useAuth()`): adds `username: string | null`, `needsUsername: boolean`, `refreshProfile: () => Promise<void>` to `AuthState`. `needsUsername` is `true` only when configured, signed in, and the profile fetch returned `null`.

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/__tests__/SyncProvider.username.test.tsx
import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/supabase/client", () => ({
  isSupabaseConfigured: () => true,
  supabaseBrowser: () => ({
    auth: {
      onAuthStateChange: (cb: (e: string, s: unknown) => void) => {
        cb("INITIAL_SESSION", { user: { id: "u1", email: "a@b.c", user_metadata: {} } });
        return { data: { subscription: { unsubscribe: () => {} } } };
      },
      signInWithOAuth: vi.fn(), signOut: vi.fn(),
    },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }),
  }),
}));
vi.mock("@/lib/sync/cloud", () => ({ pullCloud: async () => [], pushEntries: async () => {}, deleteEntries: async () => {} }));

import { SyncProvider, useAuth } from "@/components/SyncProvider";
function Probe() {
  const { needsUsername } = useAuth();
  return <span>needs:{String(needsUsername)}</span>;
}

describe("SyncProvider username", () => {
  it("sets needsUsername when the signed-in user has no profile row", async () => {
    render(<SyncProvider><Probe /></SyncProvider>);
    await waitFor(() => expect(screen.getByText("needs:true")).toBeInTheDocument());
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/components/__tests__/SyncProvider.username.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement**

In `SyncProvider.tsx`:
- Extend `AuthState` with `username: string | null; needsUsername: boolean; refreshProfile: () => Promise<void>;` and the default context value.
- Add state: `const [username, setUsername] = useState<string | null>(null);` and `const [needsUsername, setNeedsUsername] = useState(false);`.
- Add a `refreshProfile` that, when configured and a user id is known, calls `getProfileByUserId(supabaseBrowser(), uid)` and sets `username`/`needsUsername` (`needsUsername = profile === null`). Wrap in try/catch → on error, leave `needsUsername=false` (never block).
- Call the profile fetch inside `onSignedIn` after `setUser(u)` (both for the already-synced early-return branch and the full branch). In `onSignedOut`, reset `setUsername(null); setNeedsUsername(false);`.
- Add `username, needsUsername, refreshProfile` to the provider `value`.

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/components/__tests__/SyncProvider.username.test.tsx` then the existing `SyncProvider.test.tsx` / `SyncProvider.configured.test.tsx` (still green).

- [ ] **Step 5: Commit**

```bash
git add src/components/SyncProvider.tsx src/components/__tests__/SyncProvider.username.test.tsx
git commit -m "feat(auth): expose username/needsUsername/refreshProfile from SyncProvider"
```

---

### Task 7: Welcome flow — username picker, gate redirect, privacy notice

**Files:**
- Create: `src/components/WelcomeForm.tsx` (client)
- Create: `src/app/welcome/page.tsx`
- Create: `src/components/ProfileGate.tsx` (client; redirects signed-in-without-username users to `/welcome`)
- Modify: `src/app/layout.tsx` (mount `<ProfileGate />` inside `SyncProvider`)
- Test: `src/components/__tests__/WelcomeForm.test.tsx`

**Interfaces:**
- Consumes: `validateUsername` (Task 2), `createProfile` (Task 3), `useAuth` + `refreshProfile` (Task 6), `supabaseBrowser`.
- Produces: `WelcomeForm` (self-contained), `ProfileGate` (renders null; side-effect redirect).

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/__tests__/WelcomeForm.test.tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, replace: push }), useSearchParams: () => new URLSearchParams("") }));
const createProfile = vi.fn(async () => ({ ok: false, error: "taken" }));
vi.mock("@/lib/profile/queries", () => ({ createProfile: (...a: unknown[]) => createProfile(...a) }));
vi.mock("@/lib/supabase/client", () => ({ isSupabaseConfigured: () => true, supabaseBrowser: () => ({}) }));
vi.mock("@/components/SyncProvider", () => ({
  useAuth: () => ({ user: { email: "a@b.c", avatarUrl: null }, username: null, refreshProfile: async () => {} }),
}));

import { WelcomeForm } from "@/components/WelcomeForm";

describe("WelcomeForm", () => {
  it("shows a validation error for an invalid username without submitting", async () => {
    render(<WelcomeForm />);
    await userEvent.type(screen.getByLabelText(/username/i), "ab");
    await userEvent.click(screen.getByRole("button", { name: /claim/i }));
    expect(screen.getByText(/at least 3/i)).toBeInTheDocument();
    expect(createProfile).not.toHaveBeenCalled();
  });
  it("surfaces a 'taken' error from the server", async () => {
    render(<WelcomeForm />);
    await userEvent.type(screen.getByLabelText(/username/i), "aziz");
    await userEvent.click(screen.getByRole("button", { name: /claim/i }));
    expect(await screen.findByText(/already taken/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/components/__tests__/WelcomeForm.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement**

`WelcomeForm.tsx` (client): controlled input; on submit run `validateUsername` → map error codes to copy (`too_short`→"Usernames must be at least 3 characters.", `too_long`→"…at most 20 characters.", `invalid_chars`→"Use only lowercase letters, numbers, and underscores.", `reserved`→"That username is reserved."). On valid, call `createProfile(supabaseBrowser(), { userId: <from session — read via supabaseBrowser().auth.getUser()>, username, displayName: user.email-derived or user_metadata name, avatarUrl })`. On `{ ok:false, error:"taken" }` show "That username is already taken." On success, `await refreshProfile()` then `router.replace(returnTo ?? "/")`. Include the one-time privacy notice text in the form: "Your profile will be public — you can make it private anytime from your profile page." Use the page shell container.

`app/welcome/page.tsx`: server component wrapper with `PageHead` + `<WelcomeForm />` inside the standard container.

`ProfileGate.tsx` (client):

```tsx
"use client";
import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/components/SyncProvider";
export function ProfileGate() {
  const { needsUsername } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  useEffect(() => {
    if (needsUsername && pathname !== "/welcome") {
      router.replace(`/welcome?next=${encodeURIComponent(pathname)}`);
    }
  }, [needsUsername, pathname, router]);
  return null;
}
```

Mount `<ProfileGate />` in `layout.tsx` right after `<Navbar />`.

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/components/__tests__/WelcomeForm.test.tsx` then `npm test`.

- [ ] **Step 5: Commit**

```bash
git add src/components/WelcomeForm.tsx src/components/ProfileGate.tsx src/app/welcome/ src/app/layout.tsx
git commit -m "feat(profile): welcome username picker + profile gate + privacy notice"
```

---

### Task 8: Profile presentational components — header + highlights

**Files:**
- Create: `src/components/profile/ProfileHeader.tsx`
- Create: `src/components/profile/HighlightsRow.tsx`
- Test: `src/components/profile/__tests__/ProfileHeader.test.tsx`, `src/components/profile/__tests__/HighlightsRow.test.tsx`

**Interfaces:**
- Consumes: `Profile` (Task 3); `CompactCard` from `@/components/home/CompactCard`; `Media` type.
- Produces:
  - `ProfileHeader({ profile, isOwner }: { profile: Profile; isOwner: boolean })` — avatar, display name, `@username`, join date, and `0 followers · 0 following` placeholders.
  - `HighlightsRow({ favoriteIds }: { favoriteIds: number[] })` — fetches `/api/media?ids=` for the favorites and renders a `CompactCard` row; renders nothing when `favoriteIds` is empty.

- [ ] **Step 1: Write the failing tests**

```tsx
// src/components/profile/__tests__/ProfileHeader.test.tsx
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { ProfileHeader } from "@/components/profile/ProfileHeader";

const profile = {
  userId: "u1", username: "aziz", displayName: "Aziz", avatarUrl: null,
  isPublic: true, createdAt: "2026-08-20T00:00:00.000Z",
};

describe("ProfileHeader", () => {
  it("renders the handle and follower placeholders", () => {
    render(<ProfileHeader profile={profile} isOwner={false} />);
    expect(screen.getByText("@aziz")).toBeInTheDocument();
    expect(screen.getByText(/0 followers/i)).toBeInTheDocument();
  });
});
```

```tsx
// src/components/profile/__tests__/HighlightsRow.test.tsx
import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { HighlightsRow } from "@/components/profile/HighlightsRow";

beforeEach(() => {
  global.fetch = vi.fn(async () => ({
    ok: true, json: async () => ({ items: [{ id: 3, title: "FMA", type: "ANIME", coverImage: null }] }),
  })) as never;
});

describe("HighlightsRow", () => {
  it("renders nothing when there are no favorites", () => {
    const { container } = render(<HighlightsRow favoriteIds={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
  it("renders favorite titles", async () => {
    render(<HighlightsRow favoriteIds={[3]} />);
    expect(await screen.findByText("FMA")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/components/profile/__tests__/`
Expected: FAIL.

- [ ] **Step 3: Implement** both components following existing styling idioms (`.mono` labels, `CompactCard` for covers, `next/image`-free `<img>` with the existing eslint-disable pattern). `ProfileHeader` derives the join date via `new Date(profile.createdAt).getFullYear()` (or a short formatted date). Follower/following are literal `0` placeholders with a `mono` label. `HighlightsRow` mirrors the `StatsBoard` fetch pattern (AbortController, `/api/media?ids=`), returns `null` when `favoriteIds.length === 0`, and shows a small skeleton while loading.

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/components/profile/__tests__/`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/profile/
git commit -m "feat(profile): ProfileHeader + HighlightsRow components"
```

---

### Task 9: Profile page `/u/[username]` — state resolution + owner controls

**Files:**
- Create: `src/app/u/[username]/page.tsx` (server component)
- Create: `src/components/profile/ProfileContent.tsx` (client; ties header/highlights/stats/list to fetched entries)
- Create: `src/components/profile/ProfileOwnerBar.tsx` (client; visibility toggle for the owner)
- Create: `src/lib/profile/server.ts` (server-side load: resolve profile + entries + viewer)
- Test: `src/lib/profile/__tests__/server.test.ts`, `src/components/profile/__tests__/ProfileOwnerBar.test.tsx`

**Interfaces:**
- Consumes: `supabaseServer()`; `getProfileByUsername` (Task 3); `pullCloud` from `@/lib/sync/cloud`; `rowToEntry` from `@/lib/sync/merge`; `StatsBoard`/`MediaList` (Task 5); `ProfileHeader`/`HighlightsRow` (Task 8); `setProfileVisibility` (Task 3).
- Produces:
  - `loadProfilePage(username: string): Promise<{ state: "not_found" } | { state: "private"; profile: Profile; isOwner: boolean } | { state: "ok"; profile: Profile; isOwner: boolean; entries: Record<number, ListEntry> }>` in `server.ts`.
  - `entriesFromRows(rows: CloudRow[]): Record<number, ListEntry>` helper (in `server.ts` or `merge.ts`).

- [ ] **Step 1: Write the failing test (server loader)**

```typescript
// src/lib/profile/__tests__/server.test.ts
import { describe, it, expect, vi } from "vitest";

// Mock the Supabase server client + queries the loader uses.
const profile = { userId: "u1", username: "aziz", displayName: "Aziz", avatarUrl: null, isPublic: true, createdAt: "2026-08-20T00:00:00.000Z" };
vi.mock("@/lib/supabase/server", () => ({ supabaseServer: async () => ({ auth: { getUser: async () => ({ data: { user: null } }) } }) }));
vi.mock("@/lib/profile/queries", () => ({ getProfileByUsername: async () => profile }));
vi.mock("@/lib/sync/cloud", () => ({ pullCloud: async () => ([
  { user_id: "u1", media_id: 1, status: "completed", score: 9, progress: 12, updated_at: "2026-01-01T00:00:00Z", is_favorite: true },
]) }));

import { loadProfilePage } from "@/lib/profile/server";

describe("loadProfilePage", () => {
  it("returns ok state with mapped entries for a public profile", async () => {
    const res = await loadProfilePage("aziz");
    expect(res.state).toBe("ok");
    if (res.state === "ok") {
      expect(res.isOwner).toBe(false);
      expect(res.entries[1].isFavorite).toBe(true);
    }
  });
});
```

Add a second test: when `getProfileByUsername` resolves `null`, `loadProfilePage` returns `{ state: "not_found" }`; when `profile.isPublic === false` and viewer is not owner, returns `{ state: "private" }`.

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/lib/profile/__tests__/server.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `server.ts`**

```typescript
// src/lib/profile/server.ts
import type { ListEntry } from "@/lib/list/schema";
import type { CloudRow } from "@/lib/sync/types";
import { rowToEntry } from "@/lib/sync/merge";
import { supabaseServer } from "@/lib/supabase/server";
import { getProfileByUsername } from "@/lib/profile/queries";
import type { Profile } from "@/lib/profile/types";

export function entriesFromRows(rows: CloudRow[]): Record<number, ListEntry> {
  const out: Record<number, ListEntry> = {};
  for (const row of rows) { const { mediaId, entry } = rowToEntry(row); out[mediaId] = entry; }
  return out;
}

export type ProfilePageState =
  | { state: "not_found" }
  | { state: "private"; profile: Profile; isOwner: boolean }
  | { state: "ok"; profile: Profile; isOwner: boolean; entries: Record<number, ListEntry> };

export async function loadProfilePage(username: string): Promise<ProfilePageState> {
  const supabase = await supabaseServer();
  const profile = await getProfileByUsername(supabase as never, username);
  if (!profile) return { state: "not_found" };
  const { data } = await supabase.auth.getUser();
  const isOwner = data.user?.id === profile.userId;
  if (!profile.isPublic && !isOwner) return { state: "private", profile, isOwner };
  const { pullCloud } = await import("@/lib/sync/cloud");
  const rows = await pullCloud(supabase as never, profile.userId);
  return { state: "ok", profile, isOwner, entries: entriesFromRows(rows) };
}
```

(Guard: if `isSupabaseConfigured()` is false, `supabaseServer()` throws — the page must catch and render `notFound()`. Wrap the loader call in the page in try/catch → `notFound()`.)

`app/u/[username]/page.tsx` (server): `const { username } = await params;` → `const res = await loadProfilePage(username).catch(() => ({ state: "not_found" as const }));` → switch:
- `not_found` → `notFound()`.
- `private` → render `ProfileHeader` + a minimal "This profile is private" card (owner never lands here).
- `ok` → render (inside the standard container) `ProfileHeader`, `ProfileOwnerBar` when `isOwner`, then `<ProfileContent entries={res.entries} />`.

`ProfileContent.tsx` (client): computes the favorites ordered by score (desc) then `updatedAt` (desc) —
`favoriteIds = Object.entries(entries).filter(([, e]) => e.isFavorite).sort((a, b) => (b[1].score ?? -1) - (a[1].score ?? -1) || b[1].updatedAt.localeCompare(a[1].updatedAt)).map(([id]) => Number(id))` — renders `<HighlightsRow favoriteIds={favoriteIds} />`, `<StatsBoard entries={entries} showShareCard={false} />`, `<MediaList entries={entries} interactive={false} />`.

`ProfileOwnerBar.tsx` (client): shows current visibility and a toggle button calling `setProfileVisibility(supabaseBrowser(), userId, next)` then `router.refresh()`. Include a "This is you" label and, when private, an "only you can see this" note.

- [ ] **Step 4: Write + run the owner-bar test, then verify all pass**

```tsx
// src/components/profile/__tests__/ProfileOwnerBar.test.tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
const setVis = vi.fn(async () => {});
vi.mock("@/lib/profile/queries", () => ({ setProfileVisibility: (...a: unknown[]) => setVis(...a) }));
vi.mock("@/lib/supabase/client", () => ({ supabaseBrowser: () => ({}) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
import { ProfileOwnerBar } from "@/components/profile/ProfileOwnerBar";
describe("ProfileOwnerBar", () => {
  it("toggles visibility", async () => {
    render(<ProfileOwnerBar userId="u1" isPublic={true} />);
    await userEvent.click(screen.getByRole("button", { name: /make private/i }));
    expect(setVis).toHaveBeenCalledWith(expect.anything(), "u1", false);
  });
});
```

Run: `npx vitest run src/lib/profile src/components/profile` then `npm test` (full green).

- [ ] **Step 5: Commit**

```bash
git add src/app/u src/components/profile src/lib/profile/server.ts src/lib/profile/__tests__/server.test.ts
git commit -m "feat(profile): /u/[username] page with state resolution + owner visibility toggle"
```

---

### Task 10: Navbar/account wiring — reach your own profile

**Files:**
- Modify: `src/components/AuthButton.tsx` (avatar → link to own profile; keep a distinct sign-out control)
- Modify: `src/components/__tests__/AuthButton.test.tsx`

**Interfaces:**
- Consumes: `useAuth()` now exposing `username` (Task 6).
- Produces: signed-in users can navigate to `/u/[username]`; the local/unconfigured and signed-out states are unchanged.

- [ ] **Step 1: Update the failing test**

```tsx
// add to src/components/__tests__/AuthButton.test.tsx
it("links the avatar to the user's profile when a username exists", () => {
  // mock useAuth to return { configured: true, user: {email, avatarUrl:null}, username: "aziz", signOut, ... }
  render(<AuthButton />);
  expect(screen.getByRole("link", { name: /profile/i })).toHaveAttribute("href", "/u/aziz");
});
```

(Match the mocking style already used in the existing `AuthButton.test.tsx`; extend its `useAuth` mock to include `username`.)

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/components/__tests__/AuthButton.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement**

In the signed-in branch of `AuthButton`, when `username` is present, wrap the avatar in a `next/link` `<Link href={`/u/${username}`} aria-label="Your profile">`, and move sign-out to a small adjacent control (e.g. a tiny "Sign out" text button next to the `SYNCED · CLOUD` chip) so clicking the avatar no longer signs the user out. When `username` is null (profile not yet created), keep the avatar as-is without a link.

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/components/__tests__/AuthButton.test.tsx` then `npm test`.

- [ ] **Step 5: Commit + build check**

```bash
git add src/components/AuthButton.tsx src/components/__tests__/AuthButton.test.tsx
git commit -m "feat(nav): link account avatar to the user's public profile"
```

Then run `npm run build` once to confirm the App Router routes (`/u/[username]`, `/welcome`) type-check and compile.

---

## Post-implementation verification (whole feature)

- [ ] `npm test` — full suite green (162 existing + new tests).
- [ ] `npm run build` — clean production build.
- [ ] Browser preview (`preview_start` name `animood-dev`): sign in with Google → redirected to `/welcome` → claim a username → land back on home; avatar links to `/u/<username>`; the profile shows header, highlights (after favoriting a title on a media page), stats, and list; toggling visibility to private then opening `/u/<username>` in a logged-out tab shows the private card; a nonexistent handle 404s.
- [ ] Confirm the signed-out, unconfigured local path is unchanged (no `/welcome` redirect, no sign-in button when unconfigured).

## Deferred (not this plan)

- Following / activity feed (the follower counts are placeholders here).
- Reviews and comments.
- Reorderable/dedicated favorites, editable display name, avatar upload, user search/discovery.
