# User Discovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users find each other — a `/users` search page plus follower/following list pages on profiles.

**Architecture:** Pure app feature over existing tables + RLS (NO migration). `src/lib/discover/*` holds `searchUsers` and the follower/following loaders (plain anon-key queries; RLS returns only public profiles). A shared `UserCard`, a client `UserSearch`, the `/users` page, two server-rendered follow-list pages, clickable header counts, and a "People" nav link.

**Tech Stack:** Next.js 16 (App Router, RSC), TypeScript, Tailwind v4, Supabase (Postgres + RLS, `@supabase/ssr`), Vitest + Testing Library.

## Global Constraints

- **Node >= 22.4.** Full suite via `npm test` (sets `NODE_OPTIONS=--no-experimental-webstorage`, required on Node 25). **Never** run the full suite with bare `npx vitest run`. Single files may use `npx vitest run <path>`.
- **No new runtime dependencies. No database migration** — this slice uses existing `profiles`/`follows` tables under existing RLS.
- **Reads via the anon key under RLS only — no service-role key.** Search + lists MUST rely on the profiles RLS (`is_public = true`) to exclude private profiles — do not add any RLS bypass.
- **The signed-out / Supabase-unconfigured path must keep working** — search works logged-out; unconfigured renders a minimal note, never crashes.
- **Search input sanitization:** the search term is interpolated into a PostgREST `.or(...ilike...)` filter — it MUST be sanitized (strip characters with meaning in that filter) to keep the query well-formed and injection-safe.
- **Icons:** inline SVG set only. **Page shell:** `mx-auto max-w-[1560px] px-6 py-12 sm:px-10`.
- **SupaLike** (`src/lib/sync/cloud.ts`) is the shared structural Supabase type — reuse it.
- **Existing 227 tests must stay green.** `npm run build` exit 0. `npx tsc --noEmit` clean.
- **Commit after every task.**

---

### Task 1: Discover data-access queries (mocked Supabase)

**Files:**
- Create: `src/lib/discover/types.ts`
- Create: `src/lib/discover/queries.ts`
- Test: `src/lib/discover/__tests__/queries.test.ts`

**Interfaces:**
- Consumes: `SupaLike` from `@/lib/sync/cloud`.
- Produces:
  - `interface UserResult { username: string; displayName: string | null; avatarUrl: string | null }`
  - `sanitizeTerm(q: string): string` — trims and removes characters outside `[\p{L}\p{N} _-]` (keeps unicode letters/digits, space, underscore, hyphen).
  - `searchUsers(supabase: SupaLike, query: string, limit?: number): Promise<UserResult[]>` — default limit 20. Sanitizes; if the sanitized term is < 2 chars, returns `[]` WITHOUT querying. Else `profiles.select("username, display_name, avatar_url").or("username.ilike.%T%,display_name.ilike.%T%").order("username").limit(limit)` (T = sanitized term); maps rows → `UserResult`.
  - `getFollowers(supabase: SupaLike, userId: string, limit?: number): Promise<UserResult[]>` — default 100. Step 1: `follows.select("follower_id").eq("following_id", userId)` → ids; `[]` if none. Step 2: `profiles.select("username, display_name, avatar_url").in("user_id", ids).limit(limit)` → map to `UserResult`.
  - `getFollowing(supabase: SupaLike, userId: string, limit?: number): Promise<UserResult[]>` — symmetric: step 1 `follows.select("following_id").eq("follower_id", userId)`.

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/discover/__tests__/queries.test.ts
import { describe, it, expect, vi } from "vitest";
import { sanitizeTerm, searchUsers, getFollowers, getFollowing } from "@/lib/discover/queries";

describe("sanitizeTerm", () => {
  it("strips PostgREST-significant and wildcard chars", () => {
    expect(sanitizeTerm("  a%b,c()d*  ")).toBe("abcd");
  });
  it("keeps letters, digits, space, underscore, hyphen", () => {
    expect(sanitizeTerm("Aziz_01 dos-2")).toBe("Aziz_01 dos-2");
  });
});

describe("searchUsers", () => {
  it("returns [] for a term under 2 chars without querying", async () => {
    const from = vi.fn();
    expect(await searchUsers({ from } as never, "a")).toEqual([]);
    expect(from).not.toHaveBeenCalled();
  });
  it("maps matching profiles and passes a sanitized or() filter", async () => {
    const or = vi.fn(() => q);
    const q: Record<string, unknown> = {
      select: () => q, or, order: () => q,
      limit: async () => ({ data: [{ username: "aziz", display_name: "Aziz", avatar_url: null }], error: null }),
    };
    const users = await searchUsers({ from: () => q } as never, "az%iz");
    expect(users).toEqual([{ username: "aziz", displayName: "Aziz", avatarUrl: null }]);
    expect(or).toHaveBeenCalledWith("username.ilike.%aziz%,display_name.ilike.%aziz%");
  });
});

describe("getFollowers", () => {
  it("does the two-step ids -> profiles and maps results", async () => {
    const followsQ = { select: () => followsQ, eq: async () => ({ data: [{ follower_id: "u2" }], error: null }) };
    const profilesQ: Record<string, unknown> = {
      select: () => profilesQ, in: () => profilesQ,
      limit: async () => ({ data: [{ username: "friend", display_name: null, avatar_url: null }], error: null }),
    };
    const supabase = { from: (t: string) => (t === "follows" ? followsQ : profilesQ) } as never;
    const users = await getFollowers(supabase, "u1");
    expect(users).toEqual([{ username: "friend", displayName: null, avatarUrl: null }]);
  });
  it("returns [] when there are no follower ids", async () => {
    const followsQ = { select: () => followsQ, eq: async () => ({ data: [], error: null }) };
    const supabase = { from: () => followsQ } as never;
    expect(await getFollowers(supabase, "u1")).toEqual([]);
  });
});

describe("getFollowing", () => {
  it("filters follows by follower_id", async () => {
    const eq = vi.fn(async () => ({ data: [], error: null }));
    const followsQ = { select: () => followsQ, eq };
    const supabase = { from: () => followsQ } as never;
    await getFollowing(supabase, "u1");
    expect(eq).toHaveBeenCalledWith("follower_id", "u1");
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/lib/discover/__tests__/queries.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Write the implementation**

```typescript
// src/lib/discover/types.ts
export interface UserResult {
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
}
```

```typescript
// src/lib/discover/queries.ts
import type { SupaLike } from "@/lib/sync/cloud";
import type { UserResult } from "./types";

interface ProfileRow { username: string; display_name: string | null; avatar_url: string | null }
const COLS = "username, display_name, avatar_url";

export function sanitizeTerm(q: string): string {
  return q.trim().replace(/[^\p{L}\p{N} _-]/gu, "");
}

function toResult(r: ProfileRow): UserResult {
  return { username: r.username, displayName: r.display_name, avatarUrl: r.avatar_url };
}

export async function searchUsers(supabase: SupaLike, query: string, limit = 20): Promise<UserResult[]> {
  const t = sanitizeTerm(query);
  if (t.length < 2) return [];
  const { data, error } = await supabase.from("profiles")
    .select(COLS)
    .or(`username.ilike.%${t}%,display_name.ilike.%${t}%`)
    .order("username")
    .limit(limit);
  if (error) throw error;
  return ((data ?? []) as ProfileRow[]).map(toResult);
}

async function profilesForIds(supabase: SupaLike, ids: string[], limit: number): Promise<UserResult[]> {
  if (ids.length === 0) return [];
  const { data, error } = await supabase.from("profiles").select(COLS).in("user_id", ids).limit(limit);
  if (error) throw error;
  return ((data ?? []) as ProfileRow[]).map(toResult);
}

export async function getFollowers(supabase: SupaLike, userId: string, limit = 100): Promise<UserResult[]> {
  const { data, error } = await supabase.from("follows").select("follower_id").eq("following_id", userId);
  if (error) throw error;
  const ids = ((data ?? []) as { follower_id: string }[]).map((r) => r.follower_id);
  return profilesForIds(supabase, ids, limit);
}

export async function getFollowing(supabase: SupaLike, userId: string, limit = 100): Promise<UserResult[]> {
  const { data, error } = await supabase.from("follows").select("following_id").eq("follower_id", userId);
  if (error) throw error;
  const ids = ((data ?? []) as { following_id: string }[]).map((r) => r.following_id);
  return profilesForIds(supabase, ids, limit);
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/lib/discover/__tests__/queries.test.ts`
Expected: PASS. Then `npm test` (full suite green).

- [ ] **Step 5: Commit**

```bash
git add src/lib/discover/
git commit -m "feat(discover): searchUsers + follower/following queries"
```

---

### Task 2: UserCard + UserSearch + `/users` page + navbar "People" link

**Files:**
- Create: `src/components/discover/UserCard.tsx` (server-compatible presentational)
- Create: `src/components/discover/UserSearch.tsx` (client)
- Create: `src/app/users/page.tsx` (server)
- Modify: `src/components/Navbar.tsx` (add "People"; mobile grid 6 → 7)
- Test: `src/components/discover/__tests__/UserCard.test.tsx`, `src/components/discover/__tests__/UserSearch.test.tsx`

**Interfaces:**
- Consumes: `UserResult` + `searchUsers` (Task 1); `supabaseBrowser` + `isSupabaseConfigured` (`@/lib/supabase/client`); `CompassIcon` (`@/components/icons`).
- Produces:
  - `UserCard({ user }: { user: UserResult })` — a `next/link` to `/u/${user.username}` containing avatar (img from `avatarUrl` else gradient-initial fallback like `ProfileHeader`), display name, and `@username`.
  - `UserSearch()` — a client search box driving `searchUsers`, rendering `UserCard` results.

- [ ] **Step 1: Write the failing tests**

```tsx
// src/components/discover/__tests__/UserCard.test.tsx
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { UserCard } from "@/components/discover/UserCard";

describe("UserCard", () => {
  it("links to the user's profile and shows the handle", () => {
    render(<UserCard user={{ username: "aziz", displayName: "Aziz", avatarUrl: null }} />);
    const link = screen.getByRole("link", { name: /aziz/i });
    expect(link).toHaveAttribute("href", "/u/aziz");
    expect(screen.getByText("@aziz")).toBeInTheDocument();
  });
});
```

```tsx
// src/components/discover/__tests__/UserSearch.test.tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
const searchUsers = vi.fn();
vi.mock("@/lib/discover/queries", () => ({ searchUsers: (...a: unknown[]) => searchUsers(...a) }));
vi.mock("@/lib/supabase/client", () => ({ isSupabaseConfigured: () => true, supabaseBrowser: () => ({}) }));
import { UserSearch } from "@/components/discover/UserSearch";

beforeEach(() => { searchUsers.mockReset(); });

describe("UserSearch", () => {
  it("shows results after typing a query", async () => {
    searchUsers.mockResolvedValue([{ username: "aziz", displayName: "Aziz", avatarUrl: null }]);
    render(<UserSearch />);
    await userEvent.type(screen.getByRole("textbox"), "azi");
    expect(await screen.findByText("@aziz")).toBeInTheDocument();
  });
  it("shows an empty state when no users match", async () => {
    searchUsers.mockResolvedValue([]);
    render(<UserSearch />);
    await userEvent.type(screen.getByRole("textbox"), "zzz");
    expect(await screen.findByText(/no users found/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/components/discover/__tests__/UserCard.test.tsx src/components/discover/__tests__/UserSearch.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement**

`UserCard.tsx`: a `<Link href={`/u/${user.username}`}>` styled like a row/card (reuse `border border-border bg-surface/40 rounded-2xl` conventions), avatar fallback matching `ProfileHeader`, `{displayName ?? username}` + `@{username}`.

`UserSearch.tsx` (client, `"use client"`): controlled input; `useEffect` debounces (~300ms) on the query; when configured and the trimmed query length ≥ 2, call `searchUsers(supabaseBrowser(), q)` (guard against races with a request id or cancel flag), set results/loading/error. States: idle (query < 2 → "Search for people by username."), loading skeleton, results (`UserCard` list), empty ("No users found."). When `!isSupabaseConfigured()`, render a minimal "User search is unavailable." note (no input). Input has `aria-label="Search users"`.

`app/users/page.tsx` (server): page shell + `PageHead kicker="PEOPLE · FIND USERS"` + `<UserSearch />`.

`Navbar.tsx`: import `CompassIcon`; add `{ href: "/users", label: "People", Icon: CompassIcon }` to `NAV` (after "Feed"); change the mobile bottom-nav `grid-cols-6` → `grid-cols-7`. Leave desktop flex nav as-is.

- [ ] **Step 4: Run to verify pass**

Run the two test files, then `npm test`, then `npx tsc --noEmit`, then `npm run build` (exit 0; `/users` compiles).

- [ ] **Step 5: Commit**

```bash
git add src/components/discover/ src/app/users/ src/components/Navbar.tsx
git commit -m "feat(discover): /users search page + UserCard + People nav link"
```

---

### Task 3: Follower/following list pages + clickable header counts

**Files:**
- Create: `src/lib/discover/server.ts` (loader)
- Create: `src/app/u/[username]/followers/page.tsx` (server)
- Create: `src/app/u/[username]/following/page.tsx` (server)
- Modify: `src/components/profile/ProfileHeader.tsx` (counts → links)
- Test: `src/lib/discover/__tests__/server.test.ts`; extend `src/components/profile/__tests__/ProfileHeader.test.tsx`

**Interfaces:**
- Consumes: `getProfileCard` (`@/lib/profile/queries`), `getFollowers`/`getFollowing` (Task 1), `UserCard` (Task 2), `supabaseServer`.
- Produces:
  - `type FollowDirection = "followers" | "following"`
  - `loadFollowList(username: string, direction: FollowDirection): Promise<{ state: "not_found" } | { state: "ok"; profile: Profile; users: UserResult[] }>` — resolves the profile via `getProfileCard`; `not_found` if null; else fetches the matching list for `profile.userId`.

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/discover/__tests__/server.test.ts
import { describe, it, expect, vi } from "vitest";
const profile = { userId: "u1", username: "aziz", displayName: "Aziz", avatarUrl: null, isPublic: true, createdAt: "2026-08-20T00:00:00Z" };
vi.mock("@/lib/supabase/server", () => ({ supabaseServer: async () => ({}) }));
vi.mock("@/lib/profile/queries", () => ({ getProfileCard: async (_s: unknown, u: string) => (u === "aziz" ? profile : null) }));
vi.mock("@/lib/discover/queries", () => ({
  getFollowers: async () => [{ username: "f1", displayName: null, avatarUrl: null }],
  getFollowing: async () => [{ username: "g1", displayName: null, avatarUrl: null }],
}));
import { loadFollowList } from "@/lib/discover/server";

describe("loadFollowList", () => {
  it("returns not_found for an unknown username", async () => {
    expect(await loadFollowList("nope", "followers")).toEqual({ state: "not_found" });
  });
  it("returns followers for the profile", async () => {
    const res = await loadFollowList("aziz", "followers");
    expect(res.state).toBe("ok");
    if (res.state === "ok") expect(res.users[0].username).toBe("f1");
  });
  it("returns following for the profile", async () => {
    const res = await loadFollowList("aziz", "following");
    if (res.state === "ok") expect(res.users[0].username).toBe("g1");
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/lib/discover/__tests__/server.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

```typescript
// src/lib/discover/server.ts
import { supabaseServer } from "@/lib/supabase/server";
import { getProfileCard } from "@/lib/profile/queries";
import { getFollowers, getFollowing } from "@/lib/discover/queries";
import type { Profile } from "@/lib/profile/types";
import type { UserResult } from "./types";

export type FollowDirection = "followers" | "following";
export type FollowListState =
  | { state: "not_found" }
  | { state: "ok"; profile: Profile; users: UserResult[] };

export async function loadFollowList(username: string, direction: FollowDirection): Promise<FollowListState> {
  const supabase = await supabaseServer();
  const profile = await getProfileCard(supabase as never, username);
  if (!profile) return { state: "not_found" };
  const users = direction === "followers"
    ? await getFollowers(supabase as never, profile.userId)
    : await getFollowing(supabase as never, profile.userId);
  return { state: "ok", profile, users };
}
```

`app/u/[username]/followers/page.tsx` (server):

```tsx
import { notFound } from "next/navigation";
import Link from "next/link";
import { loadFollowList } from "@/lib/discover/server";
import { UserCard } from "@/components/discover/UserCard";

export default async function FollowersPage({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  const res = await loadFollowList(username, "followers").catch(() => ({ state: "not_found" as const }));
  if (res.state === "not_found") notFound();
  return (
    <div className="mx-auto max-w-[1560px] space-y-6 px-6 py-12 sm:px-10">
      <Link href={`/u/${res.profile.username}`} className="mono text-[12px] text-muted-2 hover:text-foreground">← @{res.profile.username}</Link>
      <h1 className="font-display text-2xl font-bold tracking-tight">Followers of @{res.profile.username}</h1>
      {res.users.length === 0 ? (
        <p className="mono rounded-2xl border border-dashed border-border py-12 text-center text-xs tracking-[0.12em] text-muted-2">NO FOLLOWERS YET</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {res.users.map((u) => <UserCard key={u.username} user={u} />)}
        </div>
      )}
    </div>
  );
}
```

`app/u/[username]/following/page.tsx`: the same, with `direction="following"`, heading `@{username} is following`, and empty copy `NOT FOLLOWING ANYONE YET`.

`ProfileHeader.tsx`: replace the single counts `<span>` with two `next/link`s (import `Link from "next/link"`):

```tsx
<span className="mono">
  <Link href={`/u/${profile.username}/followers`} className="hover:text-foreground">{followCounts.followers} followers</Link>
  {" · "}
  <Link href={`/u/${profile.username}/following`} className="hover:text-foreground">{followCounts.following} following</Link>
</span>
```

Update `ProfileHeader.test.tsx`: the counts are now two separate `<Link>` elements with a " · " text node between them, so any existing assertion matching the COMBINED string (e.g. `getByText(/12 followers · 3 following/i)`) WILL break — Testing Library can't match text split across elements. Change such assertions to per-link checks: `screen.getByRole("link", { name: /12 followers/i })` has href `/u/<username>/followers`, and `screen.getByRole("link", { name: /3 following/i })` has href `/u/<username>/following`. A single-element assertion like `getByText(/0 followers/i)` (matching just one link's full text) still works and may stay. Do not weaken — the counts and the hrefs must both be asserted.

- [ ] **Step 4: Run to verify pass**

Run `npx vitest run src/lib/discover/__tests__/server.test.ts src/components/profile/__tests__/ProfileHeader.test.tsx`, then `npm test`, then `npx tsc --noEmit`, then `npm run build` (exit 0; the two new routes compile).

- [ ] **Step 5: Commit**

```bash
git add src/lib/discover/server.ts src/app/u/ src/components/profile/
git commit -m "feat(discover): follower/following list pages + clickable header counts"
```

---

## Post-implementation verification (whole feature)

- [ ] `npm test` — full suite green (227 existing + new tests).
- [ ] `npm run build` — clean; `/users`, `/u/[username]/followers`, `/u/[username]/following` compile.
- [ ] `npx tsc --noEmit` — clean.
- [ ] Manual sanity: search excludes private profiles; list pages show public users; counts link correctly.

## Deferred (not this plan)

- Follow buttons inside results; ranking/fuzzy search; pagination; suggested users; mutual-follow badges; making private profiles discoverable. Communities is a separate, later slice.
