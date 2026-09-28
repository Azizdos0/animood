# Animood — Discovery Preferences Sync Design Spec

**Date:** 2026-09-28
**Status:** Draft — awaiting approval (see §9 open questions)
**Scope:** Sync the discovery preferences of signed-in users through Supabase

## 1. Goal & scope

Discovery preferences live only in the browser today. They are stored under the
active account's namespace (`<list scope>.discovery.v1`, see
`src/lib/recommend/preferences.ts`):

| Field | Shape | Limit (current sanitizer) |
| --- | --- | --- |
| `seeds` | `{ id, title, coverImage }[]` starter favorites | 3 |
| `hiddenIds` | AniList ids hidden from picks | 5000 (most recent kept) |
| `diversity` | 0–1 variety slider | default 0.3 |
| `excludedGenres` | genre names | 30 |

A signed-in user who opens Animood on a second device gets empty preferences.
Their previously hidden titles reappear and their starter favorites are gone.
`docs/MOOD_DISCOVERY.md` lists this as a known gap.

**In scope:** a cloud mirror of these four fields for signed-in users, pulled on
sign-in and pushed on change.
**Out of scope:** guest preferences (they stay local, like the guest list),
live cross-device updates while both devices are open, and preference history.

## 2. Key decisions

- **Local-first, like the list.** `localStorage` stays the working copy and the
  UI never waits on the network. The cloud is a mirror. Signed-out behaviour is
  unchanged.
- **One row per user, whole-document last-write-wins.** Preferences are small
  and change rarely, so per-field merging isn't worth the complexity. The trade-off
  is that if two devices edit *simultaneously*, the older write is lost (see
  §9 Q1).
- **The server refuses stale writes.** A device that was offline for a week must not
  overwrite newer preferences when it reconnects. The write RPC only applies a
  document whose `client_updated_at` is newer than the stored one.
- **Validation lives in two places.** The client keeps its sanitizer, and the
  database enforces the same limits with check constraints. A modified client
  cannot store oversized data.

## 3. Data model — migration `0014_discovery_preferences.sql`

```sql
create table public.discovery_preferences (
  user_id           uuid primary key references auth.users(id) on delete cascade,
  seeds             jsonb       not null default '[]'
                    check (jsonb_typeof(seeds) = 'array' and jsonb_array_length(seeds) <= 3),
  hidden_ids        integer[]   not null default '{}'
                    check (cardinality(hidden_ids) <= 5000),
  diversity         real        not null default 0.3 check (diversity between 0 and 1),
  excluded_genres   text[]      not null default '{}'
                    check (cardinality(excluded_genres) <= 30),
  client_updated_at timestamptz not null,
  updated_at        timestamptz not null default now()
);

alter table public.discovery_preferences enable row level security;
create policy "read own preferences" on public.discovery_preferences
  for select using (auth.uid() = user_id);
-- No insert/update/delete policies: writes go through the RPC below only.
```

**Write RPC** (`security definer set search_path = public`, execute revoked from
`public`/`anon` and granted to `authenticated`, following the 0011a hardening
pattern):

```sql
save_discovery_preferences(p_seeds jsonb, p_hidden_ids integer[], p_diversity real,
                           p_excluded_genres text[], p_client_updated_at timestamptz)
returns timestamptz  -- the stored client_updated_at after the call
```

- Upserts on `auth.uid()`, never on a caller-supplied id.
- The conflict branch updates **only when**
  `excluded.client_updated_at > discovery_preferences.client_updated_at`.
- It returns the stored timestamp either way, so the client can tell "applied"
  from "a newer version exists" and pull again.
- `p_client_updated_at` is clamped to `now() + interval '5 minutes'`. A device
  with a skewed clock can't pin its version as "newest" indefinitely.

## 4. Client — `src/lib/sync/preferences.ts`

`updateDiscoveryPreferences` also records a local `updatedAt` (ISO string) in the
stored JSON. It stays inside the existing `.discovery.v1` key, so the sanitizer
ignores unknown keys safely. No storage migration is needed.

`startPreferencesSync(client, userId, status)` mirrors `startListSync`'s
lifecycle: an abortable session per account, with `stop()` on sign-out or an
account switch.

1. **On start:** select the row for `userId`.
   - **No row:** push local if it has an `updatedAt`; otherwise do nothing.
   - **Row newer than local (or local has no `updatedAt`):** write the cloud values
     into the account's local key. Dispatch the existing `animood:discovery` event
     so open views re-render.
   - **Local newer:** push local.
2. **On change** (`animood:discovery` event, debounced 1 s): push via the RPC.
   If the returned timestamp is newer than what was sent, pull and apply it.
3. **Failures** retry with the same backoff as list sync (2 s doubling to 30 s),
   and also on the `online` event. A pending push is marked by the local
   `updatedAt` being newer than a stored `syncedAt`. It therefore survives
   reloads without a separate pending list.

Guard: the session writes only to the key for **its own** `userId` scope. A late
response after `stop()` is dropped, matching list sync's account-isolation rule.

**Wiring:** `SyncProvider` starts and stops the preferences session alongside
`startListSync`. The account indicator combines the two statuses: it shows `error` if
either session errors, and `syncing` while either is syncing (see §9 Q2).

## 5. Error handling

| Case | Behaviour |
| --- | --- |
| Supabase not configured / signed out | No session; unchanged local behaviour |
| Pull fails on sign-in | Keep local values, retry with backoff; UI is never blocked |
| Push rejected as stale | Pull and apply the newer cloud version |
| Row violates a check constraint | Not retried (would loop); logged, local kept |
| Sign-out mid-request | Request aborted; the response is ignored |

## 6. Testing

- **RPC (SQL, verified against a Supabase branch):** these tests need a Supabase
  branch.
  - A newer write applies.
  - An older write is ignored and the stored timestamp is returned.
  - A future timestamp is clamped.
  - A caller cannot write another user's row.
  - Oversized arrays are rejected.
- **`sync/preferences` unit tests** with a mocked `SupaLike`:
  - first sign-in with no row;
  - cloud newer vs local newer;
  - debounce;
  - stale-rejection re-pull;
  - backoff and `online` retry;
  - no writes after `stop()`;
  - account A's response never lands in account B's key.
- **`preferences.ts`:** `updatedAt` is stamped on every update, and the sanitizer
  still accepts old stored JSON without it.
- **`SyncProvider`:** a sign-in starts both sessions, a sign-out stops both, and the
  combined status is correct.

## 7. Security notes

- Every write is scoped to `auth.uid()` inside the RPC. There are no client write
  policies, and select is restricted to the user's own row.
- Seeds store a title and cover URL copied from AniList. They are rendered as text
  and image `src` only, the same as today's local data.

## 8. Implementation sequencing

1. Migration 0014 (table, policy, RPC, grants), tested on a Supabase branch.
2. `updatedAt` stamping in `preferences.ts`, with tests.
3. `src/lib/sync/preferences.ts` session, with tests.
4. `SyncProvider` wiring and combined status, with tests.
5. Docs: `MOOD_DISCOVERY.md` "Storage" section and `SUPABASE_SETUP.md`.
6. Manual check with two browsers on the Vercel preview.

## 9. Open questions (need a decision before planning)

1. **Conflict granularity.** Whole-document last-write-wins can lose a
   simultaneous edit from another device. The alternative is per-field
   timestamps, which cost 4 extra columns and more merge code.
   *Recommendation: whole-document for v1.*
2. **Indicator.** Should preference sync errors show in the account indicator
   (proposed), or retry silently?
   *Recommendation: show them, because silently lost preferences are worse.*
3. **Guest → account on first sign-in.** Guest preferences currently stay with
   the guest, matching how the list's guest slot is only claimed when no owner
   is set. Should an unowned guest's preferences follow the same claim rule?
   *Recommendation: yes, reuse the list's claim rule.*
4. **Migration rollout.** Applying 0014 to the production Supabase project
   needs either you or Supabase connector access for this session.
