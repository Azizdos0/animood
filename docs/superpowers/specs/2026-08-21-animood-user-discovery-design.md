# Animood — User Discovery Design Spec

**Date:** 2026-08-21
**Status:** Approved (owner delegated design), ready for implementation planning
**Scope:** User search + follower/following list pages (Phase 3, fourth slice)

## 1. Vision

Make the social layer *usable*: let people find each other. Today you can only reach a
profile by knowing its exact `/u/handle`, so the follow→feed loop can't get started. This
slice adds a **user search** page and **follower/following list pages**, turning the
already-shipped profiles/following/feed into a network you can actually navigate.

Built entirely on existing tables + RLS — **no database migration required.**

## 2. Decisions (owner-delegated)

- **Two surfaces:** a `/users` search page, and `/u/[username]/followers` +
  `/u/[username]/following` list pages (reached via clickable header counts).
- **Privacy model — private profiles are not discoverable by name.** Search results and
  follow lists surface only *public* profiles (the existing profiles RLS
  `is_public = true` does this automatically). A private user is still counted in the raw
  follow totals but is not listed by name. Consistent with "private = hidden"; the
  comment-author always-show behavior remains the one deliberate exception.
- **No migration.** `searchUsers` and the follow-list loaders are plain anon-key queries
  under existing RLS. The `follows` edges are already public-readable.
- **Nav** gains a **"People"** link (mobile bottom nav: `grid-cols-6` → `grid-cols-7`).

## 3. Data access (`src/lib/discover/*`)

- `interface UserResult { username: string; displayName: string | null; avatarUrl: string | null }`
- Over `SupaLike` (from `@/lib/sync/cloud`):
  - `searchUsers(supabase, query, limit = 20): Promise<UserResult[]>` — trims `query`;
    returns `[]` for a query shorter than 2 chars. Otherwise selects public profiles
    matching username OR display_name (`.or("username.ilike.%q%,display_name.ilike.%q%")`,
    with `%`/`,` in the term escaped/stripped to keep the PostgREST filter well-formed),
    `order username`, `limit`. RLS returns only public profiles. Maps rows → `UserResult`.
  - `getFollowers(supabase, userId, limit = 100): Promise<UserResult[]>` — two-step
    (the `follows.follower_id` FK targets `auth.users`, not `profiles`, so no embed):
    (1) `follows.select("follower_id").eq("following_id", userId)` → ids;
    (2) `profiles.select("username, display_name, avatar_url").in("user_id", ids)` (RLS →
    public only) → `UserResult[]`. Returns `[]` when there are no ids.
  - `getFollowing(supabase, userId, limit = 100): Promise<UserResult[]>` — symmetric:
    `follows` filtered by `follower_id = userId` → `following_id`s → profiles.

## 4. User search — `/users`

- **Route:** `/users`, a page rendering `PageHead kicker="PEOPLE · FIND USERS"` + a client
  `UserSearch` component inside the standard page shell.
- **`src/components/discover/UserSearch.tsx`** (client): a search `<input>` (aria-labelled);
  debounced (~300ms) calls to `searchUsers(supabaseBrowser(), q)`. States: idle prompt
  ("Search for people by username."), loading skeleton, results list (`UserCard` rows),
  empty ("No users found."). When Supabase is unconfigured, render a minimal note instead
  of the input. Requires no sign-in — search works logged-out.

## 5. Follower / following lists — `/u/[username]/followers` and `/following`

- **Routes:** `/u/[username]/followers` and `/u/[username]/following`, server components.
- **Loader (`src/lib/discover/server.ts`):**
  `loadFollowList(username, direction): Promise<{ state: "not_found" } | { state: "ok"; profile: Profile; users: UserResult[] }>`
  — resolves the profile via `getProfileCard` (so a private profile's list page still
  works for its owner and shows the header); `not_found` when the username doesn't exist;
  otherwise fetches `getFollowers`/`getFollowing` for `profile.userId`. Wrap in try/catch
  → `notFound()` on throw (unconfigured).
- **Page:** page shell + a compact header ("Followers of @username" / "@username is
  following") with a back link to `/u/[username]`, then a `UserCard` list; empty state
  ("No followers yet." / "Not following anyone yet.").
- Note the list shows public profiles only, so it can be shorter than the header count
  when private users are involved — acceptable and privacy-consistent for v1.

## 6. Shared UI

- **`src/components/discover/UserCard.tsx`** (server-compatible, presentational):
  `UserCard({ user }: { user: UserResult })` — avatar (img or gradient-initial fallback,
  matching `ProfileHeader`), display name, `@username`, the whole card links to
  `/u/username`. Reused by search results and both follow lists.
- **`ProfileHeader`** — turn the `N followers · M following` text into two `next/link`s to
  `/u/[username]/followers` and `/u/[username]/following` (keeps the same text/format,
  now clickable). Still a server-compatible component.
- **`Navbar`** — add `{ href: "/users", label: "People", Icon: <an existing icon> }` to the
  `NAV` array; change the mobile bottom-nav container `grid-cols-6` → `grid-cols-7`.

## 7. Testing

Project pattern (pure-core + Vitest via `npm test` with the required NODE_OPTIONS):

- **Unit (mocked SupaLike):** `discover/queries` — `searchUsers` returns `[]` under 2
  chars, maps rows, escapes the term; `getFollowers`/`getFollowing` do the two-step
  (ids → profiles) and return `[]` when no ids.
- **Server (mocked Supabase):** `loadFollowList` — not_found when profile missing; ok maps
  users for followers and following directions.
- **Component (mocked queries):** `UserSearch` — shows results after typing, empty state,
  idle prompt; `UserCard` renders `@username` + link to `/u/username`.
- **Nav:** the "People" link is present and points to `/users`; existing Navbar test not
  weakened.
- Existing 227 tests stay green.

## 8. External setup

None — no migration, no new env. Uses existing tables (`profiles`, `follows`) + RLS.

## 9. Explicitly out of scope (this spec)

- Follow buttons *inside* search/list results (users click through to a profile to follow).
- Ranking/relevance beyond username-order; fuzzy search; pagination beyond a single limit.
- "Suggested users"/recommendations; mutual-follow indicators.
- Making private profiles discoverable; showing private users by name in lists.
- Communities (separate, later slice).
