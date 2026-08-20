# Animood — Public Profiles Design Spec

**Date:** 2026-08-20
**Status:** Approved, ready for implementation planning
**Scope:** Public user profiles at `/u/[username]` (Phase 3, first slice)

## 1. Vision

Turn Animood from a single-player list tracker into something with an audience.
Phase 2 gave users accounts and cloud-synced lists; this slice gives each account a
**public, shareable profile page** — username, stats, list, and highlights — that
anyone can visit. It is the foundation the rest of Phase 3 (following, reviews,
comments) builds on: those features all need somewhere to point.

This is deliberately the *smallest* social step. No follow graph, no reviews, no
comments yet — just identity + a public view of what a user already has.

## 2. Decisions (locked in brainstorming)

- **Build order:** all of Phase 3 social is planned; **public profiles ship first.**
- **Handle model:** user-chosen **username**; profile lives at `/u/[username]`.
- **Default visibility:** **public by default, opt-out** (`is_public` defaults true),
  with a one-time heads-up for existing users so nobody is silently exposed.
- **Profile contents:** identity header, stats summary, the anime/manga list, and a
  favorites/highlights row.
- **Favorites — kept lean:** a boolean flag on the existing list, not a separate
  reorderable system (that can come later).

## 3. Data model (Supabase)

### New `profiles` table

```sql
create extension if not exists citext;

create table public.profiles (
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

-- Anyone (incl. logged-out) may read a public profile.
create policy "public profiles readable" on public.profiles
  for select using (is_public = true);

-- A user may always read their own profile row (even when private).
create policy "own profile readable" on public.profiles
  for select using (auth.uid() = user_id);

-- A user manages only their own profile row.
create policy "own profile writable" on public.profiles
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
```

- `username` is `citext` (case-insensitive uniqueness) with a DB-level format check.
  A **reserved-name blocklist** (`api`, `u`, `admin`, `settings`, `auth`, `welcome`,
  `login`, `logout`, `search`, `stats`, `my-list`, `recommendations`, `import`, …) is
  enforced in application code before insert (kept in code so it is easy to extend).
- `display_name` / `avatar_url` are seeded from Google identity on first sign-in and
  are otherwise not user-editable in this slice.

### `list_entries` change — favorites

```sql
alter table public.list_entries
  add column is_favorite boolean not null default false;

-- Anyone may read a user's entries when that user's profile is public.
create policy "public list readable" on public.list_entries
  for select using (
    exists (
      select 1 from public.profiles p
      where p.user_id = list_entries.user_id and p.is_public = true
    )
  );
```

- The existing owner-only policies are untouched; this adds a **second SELECT policy**
  so writes stay owner-only while public reads become possible.
- `is_favorite` also needs to round-trip through the localStorage store and the
  existing cloud push/merge path (add the field to `ListEntry`, the row↔entry mappers,
  and the upsert column set). Last-write-wins by `updatedAt` still applies.

**Reads use the anon key under RLS** — no service-role secret enters the app. Public
profile pages are server-rendered and the public SELECT policies gate exactly what a
visitor can see.

## 4. Identity capture (username)

- On auth state change, the app checks whether the signed-in user has a `profiles`
  row. If not, it routes them to **`/welcome`** to choose a username.
- `/welcome` validates format live (3–20 chars, `[a-z0-9_]`), rejects reserved names,
  and on submit inserts the `profiles` row (seeding `display_name`/`avatar_url` from
  the Google identity), then returns the user to where they came from.
- The DB `unique` constraint is the source of truth for collisions; a race that slips
  past client validation surfaces as "that username is taken."
- **Existing already-signed-in users** (who have `list_entries` but no `profiles` row)
  hit `/welcome` on their next visit — this is also where the "your profile is public"
  heads-up is shown, before a username exists to expose anything.

## 5. Pages, routing & UI

### Routes

- **`/u/[username]`** — public profile page. Server-rendered; fetches the `profiles`
  row + `list_entries` via the anon key under the public RLS policies. Three states:
  - **Public** → full profile.
  - **Private** (`is_public = false`, viewer is not the owner) → minimal "This profile
    is private" card (the username exists, so not a 404).
  - **Not found** (no such username) → 404.
  - **Owner viewing own** → renders normally, with an "only you can see this" banner
    when private and a shortcut to the visibility toggle.
- **`/welcome`** — one-time username picker (section 4).
- **Settings** — add a **"Public profile" toggle** (`is_public`) and a link to view
  your own profile. Exact location confirmed against the codebase during
  implementation (wherever the account/sync control lives).

### Profile page layout (reuses existing components)

- **Identity header** — avatar, display name, `@username`, join date, and
  follower/following counts shown as `0` placeholders (wired live when following
  ships).
- **Highlights row** — favorited titles as cover cards (reuses `CompactCard`), ordered
  by score then recency.
- **Stats summary** — the existing stats dashboard components in read-only mode, fed
  the profile owner's entries.
- **The list** — status-filterable grid of tracked titles, reusing existing media
  cards.

### Required refactor (part of this work)

Stats and list views currently read directly from the localStorage store. To render
*another* user's profile they must accept **entries as input** (prop/param) rather than
always pulling from the local store. This is a targeted separation of "here are the
entries" from "here is how to display them" — the local pages pass their own store's
entries; the profile page passes the fetched owner's entries. Not a broad refactor.

## 6. Edge cases & error handling

- **Username taken / invalid / reserved** — inline errors on `/welcome`; DB unique
  constraint is the backstop.
- **Private profile** — minimal private-state card for visitors; full view for owner.
- **No profile row yet** — signed-in user without a username is routed to `/welcome`;
  their `/u/...` does not resolve until created.
- **Existing-user privacy heads-up** — because `is_public` defaults true, the first
  post-launch pass through `/welcome` surfaces a one-time notice ("Your profile is
  public — manage it in settings").
- **Empty list** — profile with zero entries shows a friendly empty state, not a
  broken grid.
- **Supabase read failure** on the profile page degrades to the existing error card /
  boundary, never a white screen. Username mutation errors surface inline.

## 7. Testing

Matches the project's pure-core + Vitest pattern:

- **Unit (pure):** username validation/normalization (format, case-folding, reserved
  names); favorites filtering/ordering for the highlights row; the entries→view
  adapters used by the stats/list components.
- **Component (mocked fetch):** profile page renders each of the three states
  (public / private / not-found); `/welcome` validates and handles the taken-username
  error.
- **RLS:** the new public SELECT policies are verified against the live DB via the
  Supabase tools (RLS cannot be unit-tested locally) — noted as an explicit
  implementation-plan step.
- The existing 162 tests must stay green; the signed-out / local-only path is
  unchanged.

## 8. External setup

- **Claude can do:** apply the `profiles` table, the `is_favorite` column, and the new
  RLS policies via the connected Supabase tools; write all app code; run tests/build.
- **User must do:** nothing new for this slice — Phase 2's Supabase project, env vars,
  and Google OAuth are already live and verified. (Google identity already provides the
  `display_name`/`avatar_url` seeds.)

## 9. Explicitly out of scope (this spec)

- **Following / activity feed** — the follower/following counts are placeholders here;
  the follow graph is the next Phase 3 slice.
- **Reviews and comments** — later Phase 3 slices.
- **Reorderable / dedicated favorites** — this slice ships a boolean flag only.
- **Editable display name / custom avatar upload** — Google-seeded values only.
- **Profile discovery / user search** — no directory or "find users" in this slice.
