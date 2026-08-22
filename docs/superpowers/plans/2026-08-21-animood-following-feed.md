# Following & Activity Feed Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a public follow graph and a `/feed` of recent activity from people you follow — the second Phase 3 slice.

**Architecture:** A new `follows` table (public-readable, insert/delete-own via RLS) plus a `get_follow_counts` RPC. Follow/unfollow actions and counts live in `src/lib/follow/*`. The feed derives from followed users' `list_entries` (ordered by `updated_at`) — no new activity table — and inherits list privacy from the existing `list_entries` RLS. UI: a Follow button + real counts on the profile header, and a `/feed` page with an activity stream, reachable from the navbar.

**Tech Stack:** Next.js 16 (App Router, RSC), TypeScript, Tailwind v4, Supabase (Postgres + RLS, `@supabase/ssr`), Vitest + Testing Library.

## Global Constraints

- **Node >= 22.4.** Run the full suite via `npm test` (it sets `NODE_OPTIONS=--no-experimental-webstorage`, required on Node 25). **Never** run the full suite with bare `npx vitest run` — it yields bogus `localStorage.clear is not a function` failures. Single files may use `npx vitest run <path>`.
- **No new runtime dependencies.**
- **Reads/writes use the anon key under RLS only — no service-role key in the app.**
- **The signed-out / Supabase-unconfigured path must keep working** (local-only mode). New pages must render a friendly prompt when signed-out, never crash or redirect.
- **Icons:** inline SVG set in `src/components/icons.tsx` only — no emoji/char glyphs.
- **Page shell:** each page provides its own `mx-auto max-w-[1560px] px-6 py-12 sm:px-10` container.
- **SupaLike:** the shared structural Supabase type is `src/lib/sync/cloud.ts` `SupaLike` — it already has `from(table)` and `rpc(fn, args?)`. Reuse it; do not redefine.
- **Existing 198 tests must stay green.** `npm run build` must exit 0. `npx tsc --noEmit` clean.
- **Commit after every task.**

---

### Task 1: Database migration — `follows` table + `get_follow_counts` RPC

**Files:**
- Create: `supabase/migrations/0004_follows.sql`
- Apply to project ref `teerejvdaohbtlrxxcdo` via the Supabase `apply_migration` tool.

**Interfaces:**
- Produces (DB): table `public.follows(follower_id uuid, following_id uuid, created_at timestamptz, pk(follower_id,following_id), check follower_id<>following_id)`; RLS (public SELECT, insert/delete own); function `public.get_follow_counts(p_user_id uuid) returns table(followers int, following int)`.

- [ ] **Step 1: Write the migration file**

```sql
-- supabase/migrations/0004_follows.sql
create table if not exists public.follows (
  follower_id  uuid        not null references auth.users(id) on delete cascade,
  following_id uuid        not null references auth.users(id) on delete cascade,
  created_at   timestamptz not null default now(),
  primary key (follower_id, following_id),
  constraint no_self_follow check (follower_id <> following_id)
);

alter table public.follows enable row level security;

drop policy if exists "follows readable" on public.follows;
create policy "follows readable" on public.follows
  for select using (true);

drop policy if exists "insert own follows" on public.follows;
create policy "insert own follows" on public.follows
  for insert with check (auth.uid() = follower_id);

drop policy if exists "delete own follows" on public.follows;
create policy "delete own follows" on public.follows
  for delete using (auth.uid() = follower_id);

create or replace function public.get_follow_counts(p_user_id uuid)
returns table (followers integer, following integer)
language sql
stable
security invoker
set search_path = public
as $$
  select
    (select count(*) from public.follows f where f.following_id = p_user_id)::int,
    (select count(*) from public.follows f where f.follower_id  = p_user_id)::int;
$$;

revoke all on function public.get_follow_counts(uuid) from public;
grant execute on function public.get_follow_counts(uuid) to anon, authenticated;
```

- [ ] **Step 2: Apply the migration** via the Supabase `apply_migration` tool (name `0004_follows`, project_id `teerejvdaohbtlrxxcdo`).

- [ ] **Step 3: Verify** with `list_tables` (verbose) — confirm `public.follows` with the two uuid columns, the composite PK, and the `no_self_follow` CHECK. Run `execute_sql` `select * from public.get_follow_counts('00000000-0000-0000-0000-000000000000');` and confirm it returns `{followers:0, following:0}`. Run `get_advisors` (security) and confirm no new "RLS disabled"/"policy allows all" ERROR (the pre-existing leaked-password + citext WARNs are expected).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0004_follows.sql
git commit -m "feat(db): follows table + RLS + get_follow_counts RPC"
```

---

### Task 2: Follow data-access queries (mocked Supabase)

**Files:**
- Create: `src/lib/follow/queries.ts`
- Test: `src/lib/follow/__tests__/queries.test.ts`

**Interfaces:**
- Consumes: `SupaLike` from `@/lib/sync/cloud`.
- Produces:
  - `followUser(supabase: SupaLike, followerId: string, followingId: string): Promise<void>` — inserts a row; a Postgres unique-violation (`23505`) is treated as success (already following); other errors throw.
  - `unfollowUser(supabase: SupaLike, followerId: string, followingId: string): Promise<void>` — deletes the row; error throws.
  - `isFollowing(supabase: SupaLike, followerId: string, followingId: string): Promise<boolean>` — true if a row exists.
  - `getFollowCounts(supabase: SupaLike, userId: string): Promise<{ followers: number; following: number }>` — via `rpc("get_follow_counts", { p_user_id })`; maps the first returned row; missing → `{followers:0,following:0}`.

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/follow/__tests__/queries.test.ts
import { describe, it, expect, vi } from "vitest";
import { followUser, unfollowUser, isFollowing, getFollowCounts } from "@/lib/follow/queries";

function fakeFrom(handlers: Record<string, unknown>) {
  return { from: () => handlers } as never;
}

describe("followUser", () => {
  it("treats a 23505 unique-violation as success", async () => {
    const q = { insert: async () => ({ error: { code: "23505" } }) };
    await expect(followUser(fakeFrom(q), "a", "b")).resolves.toBeUndefined();
  });
  it("throws on other errors", async () => {
    const q = { insert: async () => ({ error: { code: "500", message: "x" } }) };
    await expect(followUser(fakeFrom(q), "a", "b")).rejects.toBeTruthy();
  });
});

describe("unfollowUser", () => {
  it("deletes the follower/following pair", async () => {
    const eq2 = vi.fn(async () => ({ error: null }));
    const q = { delete: () => ({ eq: () => ({ eq: eq2 }) }) };
    await expect(unfollowUser(fakeFrom(q), "a", "b")).resolves.toBeUndefined();
    expect(eq2).toHaveBeenCalled();
  });
});

describe("isFollowing", () => {
  it("returns true when a row exists", async () => {
    const q = { select: () => q, eq: () => q, maybeSingle: async () => ({ data: { follower_id: "a" }, error: null }) } as Record<string, unknown>;
    expect(await isFollowing(fakeFrom(q), "a", "b")).toBe(true);
  });
  it("returns false when no row", async () => {
    const q = { select: () => q, eq: () => q, maybeSingle: async () => ({ data: null, error: null }) } as Record<string, unknown>;
    expect(await isFollowing(fakeFrom(q), "a", "b")).toBe(false);
  });
});

describe("getFollowCounts", () => {
  it("maps the rpc row", async () => {
    const supabase = { rpc: async () => ({ data: [{ followers: 3, following: 5 }], error: null }) } as never;
    expect(await getFollowCounts(supabase, "u1")).toEqual({ followers: 3, following: 5 });
  });
  it("defaults to zero when empty", async () => {
    const supabase = { rpc: async () => ({ data: [], error: null }) } as never;
    expect(await getFollowCounts(supabase, "u1")).toEqual({ followers: 0, following: 0 });
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/lib/follow/__tests__/queries.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Write the implementation**

```typescript
// src/lib/follow/queries.ts
import type { SupaLike } from "@/lib/sync/cloud";

const TABLE = "follows";

export async function followUser(supabase: SupaLike, followerId: string, followingId: string): Promise<void> {
  const { error } = await supabase.from(TABLE).insert({ follower_id: followerId, following_id: followingId });
  if (error && (error as { code?: string }).code !== "23505") throw error;
}

export async function unfollowUser(supabase: SupaLike, followerId: string, followingId: string): Promise<void> {
  const { error } = await supabase.from(TABLE).delete().eq("follower_id", followerId).eq("following_id", followingId);
  if (error) throw error;
}

export async function isFollowing(supabase: SupaLike, followerId: string, followingId: string): Promise<boolean> {
  const { data, error } = await supabase.from(TABLE).select("follower_id")
    .eq("follower_id", followerId).eq("following_id", followingId).maybeSingle();
  if (error) throw error;
  return data != null;
}

export async function getFollowCounts(
  supabase: SupaLike, userId: string
): Promise<{ followers: number; following: number }> {
  const { data, error } = await supabase.rpc("get_follow_counts", { p_user_id: userId });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  return { followers: row?.followers ?? 0, following: row?.following ?? 0 };
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/lib/follow/__tests__/queries.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/follow/
git commit -m "feat(follow): follow/unfollow/isFollowing/getFollowCounts queries"
```

---

### Task 3: Feed server loader + types (mocked Supabase)

**Files:**
- Create: `src/lib/feed/types.ts`
- Create: `src/lib/feed/server.ts`
- Test: `src/lib/feed/__tests__/server.test.ts`

**Interfaces:**
- Consumes: `supabaseServer` (`@/lib/supabase/server`), `ListStatus` (`@/lib/list/schema`).
- Produces:
  - `interface FeedItem { username: string; displayName: string | null; avatarUrl: string | null; mediaId: number; status: ListStatus; score: number | null; updatedAt: string }`
  - `type FeedState = { state: "signed_out" } | { state: "ok"; items: FeedItem[] }`
  - `loadFeed(limit?: number): Promise<FeedState>` — default limit 50. Resolves the viewer via `supabaseServer().auth.getUser()`; no user → `{state:"signed_out"}`. Reads following ids from `follows` (`follower_id = viewer`); if none → `{state:"ok", items: []}`. Reads `list_entries` where `user_id in (followingIds)` ordered by `updated_at desc` limit `limit` (RLS drops private users' rows). Fetches the distinct `profiles` for those user_ids (one query) and maps each entry row → `FeedItem` (dropping any row whose profile is missing). Returns `{state:"ok", items}`.

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/feed/__tests__/server.test.ts
import { describe, it, expect, vi } from "vitest";

// Build a chainable query stub whose terminal awaited value is `result`.
function tableStub(result: { data: unknown; error: unknown }) {
  const q: Record<string, unknown> = {};
  for (const m of ["select", "eq", "in", "order", "limit"]) q[m] = () => q;
  // make the object awaitable
  (q as { then: unknown }).then = (res: (v: unknown) => void) => res(result);
  return q;
}

let user: { id: string } | null;
const follows = { data: [{ following_id: "u2" }], error: null };
const entries = { data: [
  { user_id: "u2", media_id: 5, status: "completed", score: 9, updated_at: "2026-02-01T00:00:00Z" },
], error: null };
const profiles = { data: [
  { user_id: "u2", username: "friend", display_name: "Friend", avatar_url: null },
], error: null };

vi.mock("@/lib/supabase/server", () => ({
  supabaseServer: async () => ({
    auth: { getUser: async () => ({ data: { user } }) },
    from: (table: string) =>
      table === "follows" ? tableStub(follows)
      : table === "list_entries" ? tableStub(entries)
      : tableStub(profiles),
  }),
}));

import { loadFeed } from "@/lib/feed/server";

describe("loadFeed", () => {
  it("returns signed_out when there is no user", async () => {
    user = null;
    expect(await loadFeed()).toEqual({ state: "signed_out" });
  });
  it("maps followed users' entries into FeedItems", async () => {
    user = { id: "u1" };
    const res = await loadFeed();
    expect(res.state).toBe("ok");
    if (res.state === "ok") {
      expect(res.items).toHaveLength(1);
      expect(res.items[0]).toMatchObject({ username: "friend", mediaId: 5, status: "completed", score: 9 });
    }
  });
});
```

(Implementer note: match the awaitable-stub approach to how the real supabase-js query builder resolves — a thenable that yields `{data,error}`. If a different stub shape is cleaner for the actual call chain you write, adjust the test stub accordingly, but keep the two assertions.)

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/lib/feed/__tests__/server.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Write the implementation**

```typescript
// src/lib/feed/types.ts
import type { ListStatus } from "@/lib/list/schema";

export interface FeedItem {
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  mediaId: number;
  status: ListStatus;
  score: number | null;
  updatedAt: string;
}

export type FeedState = { state: "signed_out" } | { state: "ok"; items: FeedItem[] };
```

```typescript
// src/lib/feed/server.ts
import { supabaseServer } from "@/lib/supabase/server";
import type { FeedItem, FeedState } from "./types";

export async function loadFeed(limit = 50): Promise<FeedState> {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const viewer = userData.user;
  if (!viewer) return { state: "signed_out" };

  const { data: followRows, error: followErr } = await supabase
    .from("follows").select("following_id").eq("follower_id", viewer.id);
  if (followErr) throw followErr;
  const ids = (followRows ?? []).map((r: { following_id: string }) => r.following_id);
  if (ids.length === 0) return { state: "ok", items: [] };

  const { data: entryRows, error: entryErr } = await supabase
    .from("list_entries")
    .select("user_id, media_id, status, score, updated_at")
    .in("user_id", ids)
    .order("updated_at", { ascending: false })
    .limit(limit);
  if (entryErr) throw entryErr;
  const rows = entryRows ?? [];
  if (rows.length === 0) return { state: "ok", items: [] };

  const distinctIds = [...new Set(rows.map((r: { user_id: string }) => r.user_id))];
  const { data: profRows, error: profErr } = await supabase
    .from("profiles").select("user_id, username, display_name, avatar_url").in("user_id", distinctIds);
  if (profErr) throw profErr;
  const byId = new Map<string, { username: string; display_name: string | null; avatar_url: string | null }>();
  for (const p of profRows ?? []) byId.set(p.user_id, p);

  const items: FeedItem[] = [];
  for (const r of rows) {
    const p = byId.get(r.user_id);
    if (!p) continue;
    items.push({
      username: p.username, displayName: p.display_name, avatarUrl: p.avatar_url,
      mediaId: r.media_id, status: r.status, score: r.score, updatedAt: r.updated_at,
    });
  }
  return { state: "ok", items };
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/lib/feed/__tests__/server.test.ts`
Expected: PASS. Then `npm test` (full suite green).

- [ ] **Step 5: Commit**

```bash
git add src/lib/feed/
git commit -m "feat(feed): loadFeed server loader deriving activity from followed lists"
```

---

### Task 4: Extend `loadProfilePage` with follow counts + viewer-follows

**Files:**
- Modify: `src/lib/profile/server.ts`
- Test: `src/lib/profile/__tests__/server.test.ts` (extend)

**Interfaces:**
- Consumes: `getFollowCounts`, `isFollowing` (Task 2).
- Produces: `ProfilePageState` gains `followCounts: { followers: number; following: number }` on BOTH the `private` and `ok` states, and `viewerFollows: boolean` on both (true only when a signed-in non-owner already follows this profile; false for owner/logged-out). `not_found` is unchanged.

- [ ] **Step 1: Write/extend the failing test**

```typescript
// add to src/lib/profile/__tests__/server.test.ts
// (the existing mock stubs supabaseServer/getProfileCard/pullCloud; extend the
// queries mock so getFollowCounts + isFollowing are controllable, then assert:)
it("includes follow counts and viewerFollows on the ok state", async () => {
  // arrange the mocks so getFollowCounts → {followers:2,following:1}, isFollowing → false,
  // a public profile, a signed-in non-owner viewer
  const res = await loadProfilePage("aziz");
  expect(res.state).toBe("ok");
  if (res.state === "ok") {
    expect(res.followCounts).toEqual({ followers: 2, following: 1 });
    expect(res.viewerFollows).toBe(false);
  }
});
```

(Implementer: adapt to the file's existing mock style. Mock `@/lib/follow/queries`'s `getFollowCounts` and `isFollowing`. Keep the existing ok/not_found/private assertions green — update them to also expect the new fields where the state carries them.)

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/lib/profile/__tests__/server.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

Update `ProfilePageState`:

```typescript
type FollowCounts = { followers: number; following: number };
export type ProfilePageState =
  | { state: "not_found" }
  | { state: "private"; profile: Profile; isOwner: boolean; followCounts: FollowCounts; viewerFollows: boolean }
  | { state: "ok"; profile: Profile; isOwner: boolean; entries: Record<number, ListEntry>; followCounts: FollowCounts; viewerFollows: boolean };
```

In `loadProfilePage`, after computing `isOwner` and the viewer, compute:
`const followCounts = await getFollowCounts(supabase as never, profile.userId);`
and `const viewerFollows = (!isOwner && viewerId) ? await isFollowing(supabase as never, viewerId, profile.userId) : false;`
(where `viewerId = data.user?.id ?? null`). Return these on the `private` and `ok` states. Wrap the two follow reads so a failure degrades to `{followers:0,following:0}` / `false` rather than throwing the whole page (they are non-critical). Keep the existing structure otherwise.

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/lib/profile/__tests__/server.test.ts` then `npm test`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/profile/server.ts src/lib/profile/__tests__/server.test.ts
git commit -m "feat(profile): loadProfilePage returns follow counts + viewerFollows"
```

---

### Task 5: FollowButton + real header counts + profile page wiring

**Files:**
- Create: `src/components/profile/FollowButton.tsx` (client)
- Modify: `src/components/profile/ProfileHeader.tsx` (accept + render `followCounts`)
- Modify: `src/app/u/[username]/page.tsx` (pass `followCounts` to header; render `FollowButton` for a signed-in non-owner on the public/ok state)
- Test: `src/components/profile/__tests__/FollowButton.test.tsx`; extend `ProfileHeader.test.tsx`

**Interfaces:**
- Consumes: `followUser`/`unfollowUser` (Task 2), `supabaseBrowser`, `useAuth`.
- Produces:
  - `FollowButton({ targetUserId, initialFollowing }: { targetUserId: string; initialFollowing: boolean })` — resolves the viewer id via `supabaseBrowser().auth.getUser()`; shows "Following" when following (and "Follow" otherwise); clicking toggles optimistically, calling `followUser`/`unfollowUser`, reverting on error.
  - `ProfileHeader` gains a `followCounts: { followers: number; following: number }` prop; renders `N followers · M following` (singular/plural not required — keep the "followers · following" wording with numbers).

- [ ] **Step 1: Write the failing tests**

```tsx
// src/components/profile/__tests__/FollowButton.test.tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
const followUser = vi.fn(async () => {});
const unfollowUser = vi.fn(async () => {});
vi.mock("@/lib/follow/queries", () => ({
  followUser: (...a: unknown[]) => followUser(...a),
  unfollowUser: (...a: unknown[]) => unfollowUser(...a),
}));
vi.mock("@/lib/supabase/client", () => ({
  supabaseBrowser: () => ({ auth: { getUser: async () => ({ data: { user: { id: "viewer" } } }) } }),
}));
import { FollowButton } from "@/components/profile/FollowButton";

describe("FollowButton", () => {
  it("shows Follow and calls followUser on click", async () => {
    render(<FollowButton targetUserId="target" initialFollowing={false} />);
    const btn = screen.getByRole("button", { name: /^follow$/i });
    await userEvent.click(btn);
    expect(followUser).toHaveBeenCalledWith(expect.anything(), "viewer", "target");
    expect(await screen.findByRole("button", { name: /following/i })).toBeInTheDocument();
  });
  it("shows Following and calls unfollowUser when already following", async () => {
    render(<FollowButton targetUserId="target" initialFollowing={true} />);
    await userEvent.click(screen.getByRole("button", { name: /following/i }));
    expect(unfollowUser).toHaveBeenCalledWith(expect.anything(), "viewer", "target");
  });
});
```

```tsx
// add to src/components/profile/__tests__/ProfileHeader.test.tsx
it("renders real follow counts", () => {
  render(<ProfileHeader profile={profile} isOwner={false} followCounts={{ followers: 12, following: 3 }} />);
  expect(screen.getByText(/12 followers · 3 following/i)).toBeInTheDocument();
});
```

(The existing ProfileHeader tests must pass a `followCounts` prop now — update them to `followCounts={{ followers: 0, following: 0 }}` so the existing "0 followers" assertion still holds.)

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/components/profile/__tests__/FollowButton.test.tsx src/components/profile/__tests__/ProfileHeader.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement**

`ProfileHeader.tsx`: add `followCounts` to the props type; replace the literal `0 followers · 0 following` span with `{followCounts.followers} followers · {followCounts.following} following`.

`FollowButton.tsx` (client): local `following` state seeded from `initialFollowing`; a `pending` flag; on click, resolve `viewerId` via `supabaseBrowser().auth.getUser()` (bail if none), optimistically flip state, call the matching action, revert on throw. Style consistent with existing buttons (e.g. the `AuthButton` rounded-full style): "Follow" filled, "Following" outline. `aria-pressed={following}`.

`app/u/[username]/page.tsx`: pass `followCounts={res.followCounts}` to `ProfileHeader` in all rendering states that have it (private + ok). In the `ok` branch, when `!res.isOwner`, render `<FollowButton targetUserId={res.profile.userId} initialFollowing={res.viewerFollows} />` (place it near the header/owner-bar area). Owner still sees `ProfileOwnerBar`.

- [ ] **Step 4: Run to verify pass**

Run the two test files, then `npm test`, then `npx tsc --noEmit`.

- [ ] **Step 5: Commit**

```bash
git add src/components/profile/ src/app/u/
git commit -m "feat(follow): FollowButton + real header counts on profile pages"
```

---

### Task 6: Feed view + `/feed` page + navbar link

**Files:**
- Create: `src/components/feed/FeedView.tsx` (client)
- Create: `src/app/feed/page.tsx` (server)
- Modify: `src/components/Navbar.tsx` (add "Feed" nav item; widen mobile grid to 6)
- Test: `src/components/feed/__tests__/FeedView.test.tsx`

**Interfaces:**
- Consumes: `FeedItem` (Task 3), `loadFeed` (Task 3), `Media` + `/api/media`, `STATUS`→verb map.
- Produces: `FeedView({ items }: { items: FeedItem[] })` — fetches media metadata via `/api/media?ids=` (AbortController pattern), renders one row per item: avatar + `@username` link (`/u/username`) + status verb + title link (`/media/mediaId`) + optional `★ score` + relative time. Empty `items` → "Your feed is empty. Follow people to see their activity." The `/feed` page: server component, `loadFeed()`; `signed_out` → a sign-in prompt card; `ok` → `<FeedView items={...} />` inside the page shell.

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/feed/__tests__/FeedView.test.tsx
import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { FeedView } from "@/components/feed/FeedView";
import type { FeedItem } from "@/lib/feed/types";

beforeEach(() => {
  global.fetch = vi.fn(async () => ({
    ok: true, json: async () => ({ items: [{ id: 5, title: "Cowboy Bebop", type: "ANIME", coverImage: null }] }),
  })) as never;
});

const item: FeedItem = {
  username: "friend", displayName: "Friend", avatarUrl: null,
  mediaId: 5, status: "completed", score: 9, updatedAt: "2026-02-01T00:00:00Z",
};

describe("FeedView", () => {
  it("renders an activity row with user, verb, and title", async () => {
    render(<FeedView items={[item]} />);
    expect(await screen.findByText("Cowboy Bebop")).toBeInTheDocument();
    expect(screen.getByText(/@friend/)).toBeInTheDocument();
    expect(screen.getByText(/completed/i)).toBeInTheDocument();
  });
  it("shows the empty state when there are no items", () => {
    render(<FeedView items={[]} />);
    expect(screen.getByText(/your feed is empty/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/components/feed/__tests__/FeedView.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement**

`FeedView.tsx` (client): `if (items.length === 0)` → empty-state card. Else derive `ids = [...new Set(items.map(i => i.mediaId))]`, fetch `/api/media?ids=` with AbortController (mirror `HighlightsRow`/`StatsBoard`), build a `Record<number, Media>`, render rows. Status verb map:
`{ completed:"completed", watching:"is watching", planning:"plans to watch", dropped:"dropped", onhold:"put on hold" }`.
Row: avatar (img or gradient-initial fallback like ProfileHeader) + `<Link href={"/u/"+username}>@{username}</Link>` + verb + `<Link href={"/media/"+mediaId}>{title}</Link>` + `score != null` → `★ {score}` + a relative-time string from `updatedAt` (a small inline helper; no new dep). Show a skeleton while media loads.

`app/feed/page.tsx` (server): `const res = await loadFeed().catch(() => ({ state: "signed_out" as const }));` Inside the page-shell container with a `PageHead kicker="FEED · WHO YOU FOLLOW"`: if `res.state === "signed_out"` render a card ("Sign in to see what the people you follow are watching."); else `<FeedView items={res.items} />`.

`Navbar.tsx`: add `{ href: "/feed", label: "Feed", Icon: InboxIcon }` to `NAV` (import `InboxIcon` from `@/components/icons`), placed after "For You". Change the mobile bottom-nav grid from `grid-cols-5` to `grid-cols-6` so all six items fit.

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/components/feed/__tests__/FeedView.test.tsx`, then `npm test`, then `npx tsc --noEmit`, then `npm run build` (exit 0 — confirm `/feed` compiles).

- [ ] **Step 5: Commit**

```bash
git add src/components/feed/ src/app/feed/ src/components/Navbar.tsx
git commit -m "feat(feed): /feed page + FeedView + navbar Feed link"
```

---

## Post-implementation verification (whole feature)

- [ ] `npm test` — full suite green (198 existing + new tests).
- [ ] `npm run build` — clean production build; `/feed` present, `/u/[username]` still dynamic.
- [ ] `npx tsc --noEmit` — clean.
- [ ] RLS verified against the live DB (Task 1) — follows insert/delete own only, public read, self-follow rejected.

## Deferred (not this plan)

- Follower/following list pages; notifications; a dedicated activity/event table; feed filtering/pagination/realtime; reviews/comments/forums.
