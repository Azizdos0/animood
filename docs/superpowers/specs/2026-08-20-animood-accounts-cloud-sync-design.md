# Animood — Accounts & Cloud Sync Design Spec

**Date:** 2026-08-20
**Status:** Approved, ready for implementation planning
**Scope:** Optional Google login + list cloud-sync (Phase 2, first cut)

## 1. Vision

Make Animood's list follow the user across devices without giving up the current
low-friction, no-account experience. The app stays **anonymous-first**: it works
exactly as today with no login. Signing in is **optional** and adds a cloud mirror
so the list persists across browsers/devices. This is the first slice of "Phase 2"
(accounts), deliberately narrow: auth + list sync only.

## 2. Decisions (locked in brainstorming)

- **Coexistence:** optional login + automatic cloud sync (not login-required, not
  manual backup).
- **Auth + database:** Supabase (Auth + Postgres + RLS), already connected here.
- **Sign-in method:** Google OAuth ("Sign in with Google").
- **Merge on first login:** last-write-wins per title using the existing per-entry
  `updatedAt` — union of local + cloud, newest edit wins. Never lose data.

## 3. Architecture & sync model

The `localStorage` reactive store (`src/lib/list/*`) remains the UI's working copy
and source of truth. Login adds a cloud mirror; it does not replace the local store.

```
Signed out:  UI ⇄ reactive store ⇄ localStorage            (unchanged from today)

Signed in:   UI ⇄ reactive store ⇄ localStorage (cache)
                               └──► Supabase list_entries (debounced push on change)
             on sign-in:  pull cloud → merge with local → write merged to both
```

- **On sign-in:** fetch the user's cloud entries, `mergeLists(local, cloud)`
  (last-write-wins per `media_id` by `updatedAt`), write the merged store to both
  localStorage and Supabase (so the cloud reflects any local-only additions).
- **After sign-in:** each list mutation writes localStorage (instant) and pushes to
  Supabase (debounced upsert of the changed rows; deletes remove the row).
- **On sign-out:** stop pushing; the local list remains in localStorage untouched.
- **Cross-device propagation:** a second device gets the merged state on its next
  load/sign-in. Live realtime sync (Supabase Realtime) is **deferred**.

### Merge rules (the data-safety core)

`mergeLists(local: ListStoreV1, cloud: ListEntry-by-id): ListStoreV1`
- Union of all `media_id`s present in either side.
- For an id in both: keep the entry with the newer `updatedAt`.
- For an id in one: keep it.
- Pure, deterministic, and unit-tested. No deletions are inferred during merge
  (union only) so a title present on either side is never dropped — deletes only
  propagate through the post-sign-in push path.

## 4. Data model (Supabase)

Single table, row-level-security protected:

```sql
create table public.list_entries (
  user_id    uuid        not null references auth.users(id) on delete cascade,
  media_id   integer     not null,
  status     text        not null,
  score      integer,
  progress   integer     not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, media_id)
);

alter table public.list_entries enable row level security;

create policy "own rows" on public.list_entries
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
```

`status`/`score`/`progress`/`updated_at` mirror `ListEntry` exactly, so mapping
between DB rows and `ListEntry` is a direct field copy (`updated_at` ↔ `updatedAt`).
Writes use the anon key + the signed-in user's JWT; RLS enforces per-user isolation.
**No service-role key is needed in the app.**

## 5. Auth + UI

- **Supabase Auth**, Google provider. Sessions stored in cookies via `@supabase/ssr`
  so both server components and client components can read the session.
- **Sign-in flow:** navbar button → Supabase Google OAuth redirect → callback route
  (`/auth/callback`) exchanges the code for a session → redirect back.
- **Navbar chip** (currently the static "SYNCED · LOCAL"):
  - Signed out → **"Sign in"** button (triggers Google OAuth).
  - Signed in → user avatar/email + **"SYNCED · CLOUD"** and a sign-out control.
- No new pages beyond the auth callback route; the sync happens in a client
  provider mounted in the layout.

### New/changed files (indicative)

- `src/lib/supabase/client.ts`, `server.ts` — Supabase browser/server clients.
- `src/lib/sync/merge.ts` — pure `mergeLists` (+ row↔entry mappers). **Tested.**
- `src/lib/sync/cloud.ts` — pull/push helpers over `list_entries`.
- `src/components/SyncProvider.tsx` — client provider: on auth change, pull+merge+push;
  subscribe to store changes and debounce-push while signed in.
- `src/components/AuthButton.tsx` — the navbar sign-in / account control.
- `src/app/auth/callback/route.ts` — OAuth code exchange.
- Navbar wired to show `AuthButton`.

## 6. Error handling & resilience

- Supabase unreachable or a push fails → the UI is unaffected (localStorage is the
  working copy); pushes retry on the next change; a subtle "sync error" state may be
  shown on the chip but never blocks list editing.
- Not-configured fallback: if the Supabase env vars are absent (e.g. local dev
  without setup), the app runs in pure-local mode — the sign-in button is hidden and
  nothing breaks. This keeps the app deployable/runnable without accounts configured.
- Merge never deletes; worst case a stale entry reappears and the user removes it.

## 7. External setup (requires the user; documented click-by-click)

- **Claude can do:** create the Supabase project and apply the schema/RLS migration
  via the connected Supabase tools; write all app code; run tests/build.
- **User must do (~10 min, one-time):**
  1. Create a Google OAuth 2.0 Client (Google Cloud Console) and copy its client
     ID/secret.
  2. Paste them into Supabase → Authentication → Providers → Google; set the
     authorized redirect URL to the Supabase callback.
  3. Add `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` to Vercel
     (and `.env.local` for local dev).
  4. Add the site URL(s) (localhost + the Vercel domain) to Supabase Auth redirect
     allow-list.
- The implementation plan will include a precise, copy-pasteable version of these
  steps.

## 8. Testing

- **Unit (pure):** `mergeLists` — last-write-wins, union, one-sided ids, equal
  timestamps, empty sides; and the row↔`ListEntry` mappers.
- **Component (mocked Supabase):** SyncProvider pulls+merges on sign-in and pushes
  on change; AuthButton renders signed-in vs signed-out states.
- The existing 132 tests must stay green; the local-only path is unchanged when
  signed out / unconfigured.

## 9. Explicitly out of scope (this spec)

- Realtime cross-device push (Supabase Realtime).
- User profiles, usernames, avatars beyond what Google returns.
- Social features (reviews, following, sharing) — later phases.
- Email/password or magic-link sign-in (Google only for v1).
- The airing-schedule feature (separate build, queued next).
