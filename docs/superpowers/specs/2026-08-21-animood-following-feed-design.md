# Animood — Following & Activity Feed Design Spec

**Date:** 2026-08-21
**Status:** Approved (owner delegated design), ready for implementation planning
**Scope:** A follow graph + a home activity feed (Phase 3, second slice)

## 1. Vision

Turn public profiles into a network. Users can **follow** each other, see real
follower/following counts, and get a **feed** of what the people they follow are
watching and completing. This is the payoff that makes profiles worth visiting and
sets up everything else social.

Built directly on the public-profiles slice (`profiles`, `list_entries`, RLS).

## 2. Decisions (owner-delegated)

- **Follow relationships are public.** Anyone (incl. logged-out) can read the follow
  graph so counts and (later) lists work. Only the follower can create/remove their
  own follow (`auth.uid() = follower_id`). **Self-follow is rejected.**
- **The feed derives from existing `list_entries`, not a new activity table.** A feed
  item is a recent `list_entries` row (ordered by `updated_at`) belonging to someone
  the viewer follows. No new write path; no activity log to maintain.
- **Privacy is inherited for free.** The existing `list_entries` "public list readable"
  RLS policy only exposes rows of users whose profile `is_public = true`. So a *private*
  followed user contributes nothing to anyone's feed — their list stays hidden even from
  followers. No extra privacy code.
- **This slice ships counts + follow button + feed.** Deferred: follower/following list
  pages, notifications, a dedicated activity-history table, reviews/comments.

**Known v1 caveat:** MAL import stamps every entry's `updated_at` with the import time,
so importing floods a follower's feed with many items at once. Acceptable for v1; a
future activity table or import-suppression flag can address it.

## 3. Data model (Supabase)

### New `follows` table

```sql
create table public.follows (
  follower_id  uuid        not null references auth.users(id) on delete cascade,
  following_id uuid        not null references auth.users(id) on delete cascade,
  created_at   timestamptz not null default now(),
  primary key (follower_id, following_id),
  constraint no_self_follow check (follower_id <> following_id)
);

alter table public.follows enable row level security;

-- The follow graph is public (counts, and later lists).
create policy "follows readable" on public.follows
  for select using (true);

-- A user may create only their own follow rows.
create policy "insert own follows" on public.follows
  for insert with check (auth.uid() = follower_id);

-- A user may delete only their own follow rows.
create policy "delete own follows" on public.follows
  for delete using (auth.uid() = follower_id);
```

- `on delete cascade` cleans up when an account is removed.
- The `no_self_follow` CHECK plus the app-level guard both prevent self-follows.
- No UPDATE policy — follows are insert/delete only.

### Count helper (RPC, optional but preferred)

Reading exact follower/following counts for a profile is a `count(*)` on `follows`.
Because `follows` is publicly SELECTable, the counts can be read directly with
`select ... count`. We expose a small read helper to keep the client simple:

```sql
create or replace function public.get_follow_counts(p_user_id uuid)
returns table (followers integer, following integer)
language sql stable security invoker
set search_path = public
as $$
  select
    (select count(*) from public.follows f where f.following_id = p_user_id)::int,
    (select count(*) from public.follows f where f.follower_id  = p_user_id)::int;
$$;
grant execute on function public.get_follow_counts(uuid) to anon, authenticated;
```

`security invoker` (not definer) — the follows table is already public-readable, so no
privilege elevation is needed; counts are honest under normal RLS.

## 4. Follow/unfollow

- **Where:** a Follow/Unfollow button on `/u/[username]` for a public profile, shown
  only when the viewer is signed in and is **not** the owner.
- **State:** the button reflects whether the viewer already follows that user
  (`isFollowing`), resolved on the server for the initial render (so there's no flash of
  the wrong button state) and toggled client-side.
- **Actions** (`src/lib/follow/queries.ts`, over `SupaLike`):
  - `followUser(supabase, followerId, followingId)` → insert; ignore duplicate (23505) as success.
  - `unfollowUser(supabase, followerId, followingId)` → delete.
  - `isFollowing(supabase, followerId, followingId)` → boolean.
  - `getFollowCounts(supabase, userId)` → `{ followers, following }` via the RPC.
- RLS is the enforcer: a tampered `followerId` cannot insert a row for someone else
  (`with check (auth.uid() = follower_id)`).

## 5. Profile header counts

`ProfileHeader` currently renders `0 followers · 0 following` placeholders. Replace with
real counts fetched via `getFollowCounts`. The profile page's server loader
(`loadProfilePage`) additionally returns `followCounts` and (when a signed-in viewer is
not the owner) `viewerFollows`, so the header + follow button render correctly on first
paint. Counts show for both public and private profiles (they don't leak list data).

## 6. The feed — `/feed`

- **Route:** `/feed`, a server component. Requires a signed-in user; if signed-out or
  unconfigured, render a friendly "sign in to see your feed" prompt (no redirect).
- **Data (`src/lib/feed/server.ts`):** `loadFeed(limit = 50)`:
  1. Resolve the viewer via `supabaseServer().auth.getUser()`; no user → empty/prompt state.
  2. Read the viewer's following ids from `follows` (`follower_id = viewer`).
  3. If following nobody → empty state ("Follow people to fill your feed").
  4. Fetch `list_entries` where `user_id in (followingIds)` ordered by `updated_at desc`
     limit `limit`. RLS automatically drops any private followed user's rows.
  5. Join each row's `user_id` to its `profiles` row (username/displayName/avatar) — one
     `profiles` query for the distinct ids. Return `FeedItem[]`.
- **`FeedItem`:** `{ username, displayName, avatarUrl, mediaId, status, score, updatedAt }`.
- **Render (`src/components/feed/FeedView.tsx`, client):** takes `FeedItem[]`, fetches
  media metadata via `/api/media?ids=` (the established pattern), and renders rows:
  avatar + `@username` (links to `/u/username`) + a status verb + the title (links to
  `/media/id`) + score if present + relative time. Status→verb map:
  `completed→"completed"`, `watching→"is watching"`, `planning→"plans to watch"`,
  `dropped→"dropped"`, `onhold→"put on hold"`.
- **Empty/loading/error** states handled (mirror StatsBoard/MediaList conventions).

## 7. Navigation

Add a **"Feed"** link to the navbar (both desktop and the fixed mobile bottom nav),
using an existing inline icon from `@/components/icons`. Shown to everyone; when
signed-out the page itself shows the sign-in prompt (keeps the nav stable and simple).

## 8. Testing

Project pattern (pure-core + Vitest, `npm test` runs with the required NODE_OPTIONS):

- **Unit (mocked SupaLike):** `follow/queries` — follow (incl. duplicate→success),
  unfollow, isFollowing, getFollowCounts mapping.
- **Server loaders (mocked Supabase):** `loadFeed` — no-user → empty; no-follows →
  empty; maps rows+profiles into `FeedItem[]` ordered by recency. `loadProfilePage`
  extension — returns followCounts + viewerFollows without breaking existing states.
- **Component (mocked fetch):** `FeedView` renders items / empty state; the follow
  button toggles label (Follow ↔ Following) and calls the right action; `ProfileHeader`
  shows real counts.
- **RLS:** the new `follows` policies + `no_self_follow` CHECK verified against the live
  DB via the Supabase tools (can't be unit-tested locally).
- Existing 198 tests stay green.

## 9. External setup

None new — the Supabase project, env vars, and Google OAuth are already live. Claude
applies the `follows` migration + RPC via the connected Supabase tools.

## 10. Explicitly out of scope (this spec)

- Follower/following **list** pages (only counts + follow button here).
- Notifications / "X followed you".
- A dedicated activity/event table or activity history (feed is derived from current
  `list_entries` state).
- Feed filtering, pagination beyond a single limit, or realtime updates.
- Reviews, comments, forums (later slices).
