# Communities Slice B — user-created topic communities (design)

**Status:** approved design, pre-plan. **Date:** 2026-09-16.
**Depends on:** Communities Slice A (per-anime discussion boards) — reuses its
`discussion_threads`/`discussion_posts` primitive, `buildPostTree`, and `ThreadView`.

## 1. Goal & scope

Let signed-in users create named topic **communities** (e.g. "Isekai Fans"),
join them, and hold threaded discussions inside — with **roles and moderation**.
This is the remaining "communities" work after Slice A.

**In scope (v1):**
- Create a community (unique slug, name, description); creator becomes **owner**.
- **Roles:** owner / moderator / member. Owner can appoint/remove moderators.
- **Join / leave.** Posting requires membership; reading is fully public.
- Threads inside a community (reuse the Slice A thread/post primitive) with
  **pinned** threads on top.
- **Moderation tools:** remove any thread/post, **ban** a member (blocks posting),
  **pin** threads, **assign moderators**.
- A **directory** at `/communities` (searchable list) + a community page +
  a mod/settings panel.

**Explicitly out of scope (deferred, see §9):** private/members-only communities,
join requests/invites, ownership transfer, rules/flair, notifications, per-community
home feed, community avatars/banners, pagination beyond a simple limit.

## 2. Key decisions (from brainstorming)

- **Approach A:** extend the existing `discussion_threads` with a nullable
  `community_id` rather than duplicating the schema. A thread has **exactly one**
  parent — a `media_id` (Slice A) **or** a `community_id` (Slice B) — enforced by a
  CHECK. Posts, `buildPostTree`, `ThreadView`, and the `get_thread` /
  `get_thread_posts` / `soft_delete_post` RPCs are reused.
- **Public-only v1:** all communities, threads, and posts are world-readable.
  Roles/bans gate **writes**, never reads.
- **Join-to-post:** you must be a member (and not banned) to create a thread or
  reply in a community. Reading needs no account. The creator is auto-owner.
- **All writes go through SECURITY DEFINER RPCs** that check `auth.uid()`, role,
  and ban status. Communities/members/bans have **no** direct insert/update/delete
  RLS policies, so authorization lives in one place and rows cannot be forged.

## 3. Data model

### 3.1 New tables

**`communities`**
| column | type | notes |
|---|---|---|
| id | uuid pk | `gen_random_uuid()` |
| slug | citext **unique** not null | URL id; `validateSlug`: 3–30 chars `[a-z0-9_-]`, not reserved |
| name | text not null | CHECK length 1–50 |
| description | text not null default '' | CHECK length 0–500 |
| created_by | uuid not null → `profiles(user_id)` on delete cascade | |
| member_count | int not null default 0 | maintained by trigger on `community_members` |
| created_at | timestamptz not null default now() | |

RLS: `select using (true)`. **No** insert/update/delete policies (writes via RPC).

**`community_members`** — PK `(community_id, user_id)`
| column | type | notes |
|---|---|---|
| community_id | uuid → `communities(id)` on delete cascade | |
| user_id | uuid → `profiles(user_id)` on delete cascade | |
| role | text not null default 'member' | CHECK in `('owner','moderator','member')` |
| created_at | timestamptz not null default now() | |

RLS: `select using (true)` (member lists, counts, and the viewer's own role are
public). Writes via RPC only.

**`community_bans`** — PK `(community_id, user_id)`
| column | type | notes |
|---|---|---|
| community_id | uuid → `communities(id)` on delete cascade | |
| user_id | uuid → `profiles(user_id)` on delete cascade | banned user |
| banned_by | uuid → `profiles(user_id)` | audit |
| created_at | timestamptz not null default now() | |

RLS: `select` to **authenticated** only (mod panel reads it; not shown publicly).
Writes via RPC only.

### 3.2 Alter `discussion_threads`

- add `community_id uuid references communities(id) on delete cascade` (nullable)
- make `media_id` **nullable**
- add `is_pinned boolean not null default false`
- add CHECK `thread_one_parent`:
  `(media_id is not null and community_id is null) or (media_id is null and community_id is not null)`
- add index `discussion_threads_community_idx (community_id, is_pinned desc, last_activity_at desc)`

**Tighten existing insert policies** (security-critical — otherwise any signed-in
user could forge a community thread/post via direct insert, bypassing membership):
- `discussion_threads` insert policy → `auth.uid() = user_id AND community_id IS NULL`
  (direct insert only creates **media** threads; community threads go through the RPC,
  which is SECURITY DEFINER and bypasses RLS).
- `discussion_posts` insert policy → `auth.uid() = user_id AND EXISTS (select 1 from
  discussion_threads t where t.id = thread_id and t.community_id IS NULL)`
  (direct reply only into media threads; community replies go through the RPC).

Existing media RPCs (`get_media_threads`, `get_thread`, `get_thread_posts`,
`soft_delete_post`) are unchanged **except** `get_thread`, which additionally returns
`community_id` and `is_pinned` (additive columns).

### 3.3 Triggers

- `bump_community_member_count()` (SECURITY DEFINER, `search_path=public`,
  EXECUTE revoked from all — following the 0008 hardening lesson): on insert/delete of
  `community_members`, `member_count = member_count ± 1`.

## 4. RPCs (all `security definer set search_path = public`)

**Reads** (grant anon, authenticated):
- `get_community_threads(p_community_id uuid, p_limit int default 100)` → threads for a
  community, **pinned first**, then `last_activity_at desc`, with author header +
  reply_count + `is_pinned` (mirrors `get_media_threads`).
- `get_community_members(p_community_id uuid)` → members with role + profile header.

Directory reads use plain public-read client queries over `communities` (like
`searchUsers`), not an RPC.

**Membership / roles** (grant authenticated):
- `create_community(p_slug, p_name, p_description) returns uuid` — insert community
  (`created_by = auth.uid()`) + owner membership, atomically. Raises on slug conflict.
- `join_community(p_community_id)` — insert `member` row if not already a member and not
  banned; raises if banned.
- `leave_community(p_community_id)` — delete own membership. **Owner cannot leave**
  (must delete the community); raises otherwise.
- `set_member_role(p_community_id, p_target_user, p_role)` — **owner only**; sets a
  member to `moderator` or `member`. Cannot target the owner or set `owner`.
- `delete_community(p_community_id)` — **owner only**; deletes the community (cascade
  removes members, bans, and its threads/posts).

**Threads / posts in a community** (grant authenticated):
- `create_community_thread(p_community_id, p_title, p_body) returns uuid` — require
  membership + not banned; insert thread with `community_id`, `user_id = auth.uid()`.
  Length checks mirror Slice A (title 1–200, body 1–5000).
- `create_community_post(p_thread_id, p_parent_post_id, p_body)` — resolve the thread's
  `community_id`; require membership + not banned; insert post (body 1–5000).

**Moderation** (grant authenticated):
- `set_thread_pinned(p_thread_id, p_pinned)` — owner/mod of the thread's community;
  community threads only.
- `moderate_remove_post(p_post_id)` — owner/mod of the post's community; soft-delete
  (`is_deleted = true, body = ''`), keeping children (same semantics as
  `soft_delete_post`, but authorized by role instead of ownership).
- `moderate_delete_thread(p_thread_id)` — owner/mod of the thread's community;
  hard-delete the thread (cascade posts), matching Slice A's owner thread-delete.
- `ban_member(p_community_id, p_target_user)` — owner/mod; insert ban + remove
  membership. Cannot ban the owner. A **moderator cannot ban another moderator or the
  owner** (only the owner can act on moderators).
- `unban_member(p_community_id, p_target_user)` — owner/mod; delete the ban row.

A shared internal SQL helper `community_role_of(p_community_id, p_user)` returns the
caller's role (or null) and is used by the moderation RPCs to authorize.

## 5. App layer — `src/lib/communities/`

- **`types.ts`** — `Community`, `CommunityRole = 'owner'|'moderator'|'member'`,
  `CommunityMember`, `CommunitySummary` (with `memberCount`, `viewerRole`).
- **`slug.ts`** — `validateSlug` / `normalizeSlug` mirroring `profile/username.ts`
  (3–30, `[a-z0-9_-]`, reserved set incl. `new`, `manage`, `settings`, plus the
  existing `RESERVED_USERNAMES`).
- **`queries.ts`** — thin client fns over the RPCs + public-read tables (each maps
  snake→camel and returns typed results, following `discussions/queries.ts`):
  `createCommunity`, `listCommunities(search?)`, `getCommunityBySlug`,
  `getMembers`, `getMyMembership(userId)`, `joinCommunity`, `leaveCommunity`,
  `setMemberRole`, `banMember`, `unbanMember`, `deleteCommunity`,
  `createCommunityThread`, `listCommunityThreads`, `setThreadPinned`,
  `moderateRemovePost`, `moderateDeleteThread`. Validation-returning fns use the
  `{ ok: true } | { ok: false; error }` shape from Slice A.
- **`server.ts`** — `loadCommunityPage(slug, viewerId)` → `{ community, viewerRole,
  isBanned, threads }`; `loadCommunityThread(slug, threadId)` → reuses
  `getThread`/`getThreadPosts`, validates the thread belongs to that community.

## 6. UI — routes & components

Routes (App Router; `/communities/new` and `/communities/manage`-style static
segments take precedence over `[slug]`, and those words are reserved):
- **`/communities`** — directory: search box + list of `CommunityCard`s
  (name, description, member count), "Create community" button.
- **`/communities/new`** — `CreateCommunityForm` (slug + name + description; live slug
  validation, gated on sign-in).
- **`/communities/[slug]`** — `CommunityHeader` (name, description, member count,
  Join/Leave button, Manage link for owner/mod) + `CommunityBoard` (thread list,
  pinned first; "New thread" composer visible to members only).
- **`/communities/[slug]/[threadId]`** — thread page reusing `ThreadView`; when the
  viewer is owner/mod, post rows show a Remove action and the thread shows Pin/Remove.
- **`/communities/[slug]/manage`** — `CommunityManagePanel` (owner/mod): member list
  with role controls (owner: promote/demote), ban/unban, edit description, delete
  community (owner).

Components under `src/components/communities/`: `CommunityDirectory`, `CommunityCard`,
`CreateCommunityForm`, `CommunityHeader`, `CommunityBoard`, `CommunityManagePanel`,
and a `ThreadModerationActions` wrapper. **`ThreadView` is reused** — it gains optional
props to inject the reply-create handler (community RPC vs the existing media path) and
an optional per-post moderation action, so Slice A's media behavior is untouched when
those props are absent.

Navbar gains a **"Communities"** link (mobile bottom-nav grid count updated
accordingly).

All user text continues to render as **plain text** (no `dangerouslySetInnerHTML`) —
XSS-safe, matching Slice A. Directory search input is passed through `sanitizeTerm`
before any `ilike`.

## 7. Error handling

- RPCs raise on authz failure (not a member, banned, not owner/mod, owner leaving);
  client query fns map these to typed errors (`not_member`, `banned`, `forbidden`,
  `slug_taken`, `empty`, `too_long`, `unknown`) and the UI shows inline messages.
- Server loaders return discriminated unions (`not_found` | `ok`), mirroring
  `profile/server.ts` and `discussions/server.ts`; unknown failures degrade to a
  "couldn't load" card rather than throwing.
- Join/leave/mod actions are optimistic-free (await the RPC, then refresh) to keep
  state truthful.

## 8. Testing

- **Unit (Vitest, no live calls):** `validateSlug` (all branches, reserved words);
  `communities/queries.ts` mappers + error mapping (mock `SupaLike`/`rpc`); server
  loaders (mock queries); `CreateCommunityForm`/`CommunityBoard`/`CommunityManagePanel`
  render + gating (member-only composer hidden for non-members; mod actions hidden for
  members). Reuse existing `buildPostTree`/`ThreadView` tests.
- **Migration smoke tests (real DB, in the plan — lesson from 0009):** exercise the
  **real RPCs against real constraints/authz**: member can post, non-member cannot,
  banned cannot post/rejoin, mod can remove a post/thread and pin, a plain member
  cannot, only the owner can change roles, `create_community` makes the creator owner,
  the exactly-one-parent CHECK rejects a two-parent thread, and the tightened insert
  policies block a forged community thread/post via direct insert.
- Gates: `npm test` green, `npx tsc --noEmit` clean, `npm run build` exit 0.

## 9. Security notes

- Reads public; **every write authorized inside a SECURITY DEFINER RPC** keyed on
  `auth.uid()` + role + ban. No forgeable direct writes (no insert/update/delete
  policies on the new tables; tightened `discussion_threads`/`discussion_posts` insert
  policies confine direct writes to media threads).
- Trigger fn EXECUTE revoked (0008 lesson). RPC EXECUTE granted narrowly
  (reads: anon+authenticated; writes: authenticated).
- Moderator power is bounded: mods act on members and content but not on the owner or
  other moderators; only the owner manages roles and deletes the community.

## 10. Implementation sequencing (for the plan)

One spec, one branch; the plan will order it so each task is independently reviewable:

1. **DB — communities core:** the three tables, RLS, member_count trigger, and the
   membership/role RPCs (create/join/leave/set_role/delete). Smoke-test authz.
2. **DB — community threads + moderation:** alter `discussion_threads`, tighten insert
   policies, `get_community_threads`, `create_community_thread`/`create_community_post`,
   `set_thread_pinned`, `moderate_remove_post`, `moderate_delete_thread`,
   `ban`/`unban`, and the `get_thread` additive columns. Smoke-test.
3. **App layer:** `src/lib/communities/*` (types, slug, queries, server) + unit tests.
4. **UI — directory + create:** `/communities`, `/communities/new`, Navbar link.
5. **UI — community page + board:** `/communities/[slug]` with membership-gated posting.
6. **UI — community thread page:** `/communities/[slug]/[threadId]` reusing `ThreadView`
   with injected reply + moderation actions.
7. **UI — manage panel:** `/communities/[slug]/manage` (roles, bans, edit, delete).

Migrations continue from `0011` (0010 was the media_cache drop).

## 11. Deferred (post-v1)

Private/members-only communities; join requests & invites; ownership transfer; community
rules/flair; notifications; a per-community feed on the home page; thread search within a
community; richer pagination; community avatars/banners; cross-posting from a media page
into a community.
