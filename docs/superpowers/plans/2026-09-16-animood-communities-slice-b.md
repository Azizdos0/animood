# Communities Slice B Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let signed-in users create topic communities with roles (owner/moderator/member), join/post threads inside, and moderate (remove, ban, pin, assign mods), plus a searchable directory.

**Architecture:** Approach A — reuse the Slice A thread/post primitive by adding a nullable `community_id` to `discussion_threads` (a thread has exactly one parent: `media_id` OR `community_id`). Reads are public; every write goes through a SECURITY DEFINER RPC that checks `auth.uid()` + role + ban. New `communities`/`community_members`/`community_bans` tables; new `src/lib/communities/*` app layer; new `/communities` routes; `ThreadView` reused with injected reply/moderation handlers.

**Tech Stack:** Next.js 16 (App Router, RSC), TypeScript, Supabase (Postgres + RLS + SECURITY DEFINER RPCs), Vitest, Tailwind.

**Spec:** `docs/superpowers/specs/2026-09-16-animood-communities-slice-b-design.md`

## Global Constraints

- **Node >= 22.4.** Full suite via `npm test` (sets `NODE_OPTIONS=--no-experimental-webstorage`). NEVER run the full suite with bare `npx vitest run`.
- **No new runtime dependencies.**
- **Supabase project id:** `teerejvdaohbtlrxxcdo`. Apply DB changes with the Supabase `apply_migration` tool AND save the identical SQL as a repo file under `supabase/migrations/`. Migrations continue from **0011** (0010 was the media_cache drop).
- **Reads public; all writes via SECURITY DEFINER RPCs** (`set search_path = public`). New tables get a `select using (true)` policy (bans: authenticated-only) and NO insert/update/delete policies.
- **All user text renders as plain text** (never `dangerouslySetInnerHTML`). Search inputs pass through `sanitizeTerm` before any `ilike`.
- **Roles:** `owner` | `moderator` | `member`. Mods act on members + content, never on the owner or other mods; only the owner assigns roles and deletes the community.
- **Client query fns** return `{ ok: true; ... } | { ok: false; error }` for mutations (mirror `src/lib/discussions/queries.ts`); read fns throw on error and map snake→camel.
- Gates each task: `npm test` green, `npx tsc --noEmit` clean. Build (`npm run build` exit 0) required at the end of every task that touches `src/app` or `src/components`.
- **Commit after every task.**

---

### Task 1: DB — communities core (tables, RLS, membership/role RPCs)

**Files:**
- Create: `supabase/migrations/0011_communities.sql`
- Apply via `apply_migration` (name `0011_communities`) to project `teerejvdaohbtlrxxcdo`.

**Interfaces:**
- Produces (SQL objects later tasks rely on): tables `public.communities(id uuid, slug citext, name text, description text, created_by uuid, member_count int, created_at timestamptz)`, `public.community_members(community_id uuid, user_id uuid, role text, created_at timestamptz)`, `public.community_bans(community_id uuid, user_id uuid, banned_by uuid, created_at timestamptz)`; helper `public.community_role_of(uuid, uuid) returns text`; RPCs `create_community(citext,text,text) returns uuid`, `join_community(uuid)`, `leave_community(uuid)`, `set_member_role(uuid,uuid,text)`, `delete_community(uuid)`.

- [ ] **Step 1: Write the migration SQL** into `supabase/migrations/0011_communities.sql`:

```sql
-- supabase/migrations/0011_communities.sql
-- Communities Slice B: communities + membership (roles) + bans.
create extension if not exists citext;

create table if not exists public.communities (
  id           uuid        not null default gen_random_uuid() primary key,
  slug         citext      not null unique,
  name         text        not null,
  description  text        not null default '',
  created_by   uuid        not null references public.profiles(user_id) on delete cascade,
  member_count integer     not null default 0,
  created_at   timestamptz not null default now(),
  constraint community_slug_shape check (slug ~ '^[a-z0-9_-]{3,30}$'),
  constraint community_name_len  check (char_length(btrim(name)) between 1 and 50),
  constraint community_desc_len  check (char_length(description) <= 500)
);
alter table public.communities enable row level security;
drop policy if exists "communities readable" on public.communities;
create policy "communities readable" on public.communities for select using (true);

create table if not exists public.community_members (
  community_id uuid        not null references public.communities(id) on delete cascade,
  user_id      uuid        not null references public.profiles(user_id) on delete cascade,
  role         text        not null default 'member' check (role in ('owner','moderator','member')),
  created_at   timestamptz not null default now(),
  primary key (community_id, user_id)
);
create index if not exists community_members_user_idx on public.community_members (user_id);
alter table public.community_members enable row level security;
drop policy if exists "members readable" on public.community_members;
create policy "members readable" on public.community_members for select using (true);

create table if not exists public.community_bans (
  community_id uuid        not null references public.communities(id) on delete cascade,
  user_id      uuid        not null references public.profiles(user_id) on delete cascade,
  banned_by    uuid                 references public.profiles(user_id) on delete set null,
  created_at   timestamptz not null default now(),
  primary key (community_id, user_id)
);
alter table public.community_bans enable row level security;
drop policy if exists "bans readable" on public.community_bans;
create policy "bans readable" on public.community_bans for select to authenticated using (true);

-- Maintain member_count.
create or replace function public.bump_community_member_count()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    update public.communities set member_count = member_count + 1 where id = new.community_id;
  elsif tg_op = 'DELETE' then
    update public.communities set member_count = greatest(member_count - 1, 0) where id = old.community_id;
  end if;
  return null;
end; $$;
revoke all on function public.bump_community_member_count() from public, anon, authenticated;
drop trigger if exists community_members_count on public.community_members;
create trigger community_members_count
  after insert or delete on public.community_members
  for each row execute function public.bump_community_member_count();

-- Caller's role in a community (null if not a member).
create or replace function public.community_role_of(p_community_id uuid, p_user uuid)
returns text language sql stable security definer set search_path = public as $$
  select role from public.community_members
  where community_id = p_community_id and user_id = p_user;
$$;

```

Then the membership/role RPCs and grants:

```sql
create or replace function public.create_community(p_slug citext, p_name text, p_description text default '')
returns uuid language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_id uuid;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  insert into public.communities (slug, name, description, created_by)
    values (p_slug, p_name, coalesce(p_description, ''), v_uid)
    returning id into v_id;
  insert into public.community_members (community_id, user_id, role)
    values (v_id, v_uid, 'owner');
  return v_id;
end; $$;

create or replace function public.join_community(p_community_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if exists (select 1 from public.community_bans where community_id = p_community_id and user_id = v_uid)
    then raise exception 'banned'; end if;
  insert into public.community_members (community_id, user_id, role)
    values (p_community_id, v_uid, 'member')
    on conflict (community_id, user_id) do nothing;
end; $$;

create or replace function public.leave_community(p_community_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if public.community_role_of(p_community_id, v_uid) = 'owner' then raise exception 'owner_cannot_leave'; end if;
  delete from public.community_members where community_id = p_community_id and user_id = v_uid;
end; $$;

create or replace function public.set_member_role(p_community_id uuid, p_target uuid, p_role text)
returns void language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid();
begin
  if public.community_role_of(p_community_id, v_uid) <> 'owner' then raise exception 'forbidden'; end if;
  if p_role not in ('moderator','member') then raise exception 'bad_role'; end if;
  if public.community_role_of(p_community_id, p_target) = 'owner' then raise exception 'cannot_target_owner'; end if;
  update public.community_members set role = p_role
    where community_id = p_community_id and user_id = p_target;
end; $$;

create or replace function public.delete_community(p_community_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid();
begin
  if public.community_role_of(p_community_id, v_uid) <> 'owner' then raise exception 'forbidden'; end if;
  delete from public.communities where id = p_community_id;
end; $$;

revoke all on function public.community_role_of(uuid,uuid) from public, anon, authenticated;
grant execute on function public.community_role_of(uuid,uuid) to authenticated;
grant execute on function public.create_community(citext,text,text) to authenticated;
grant execute on function public.join_community(uuid) to authenticated;
grant execute on function public.leave_community(uuid) to authenticated;
grant execute on function public.set_member_role(uuid,uuid,text) to authenticated;
grant execute on function public.delete_community(uuid) to authenticated;
```

- [ ] **Step 2: Apply** the migration via `apply_migration` (name `0011_communities`, the corrected SQL — tables + trigger + all five RPCs + `community_role_of`). Do NOT include the wrong `|| null` sketch.
- [ ] **Step 3: Smoke-test authz** with `execute_sql` (these run as the service role, so `auth.uid()` is null — verify structure + constraints here; role-gated behavior is re-verified end-to-end in Task 8):
  - `insert into communities (slug,name,created_by) values ('test-comm','Test', (select user_id from profiles limit 1)) returning id;` → succeeds.
  - `insert into communities (slug,name,created_by) values ('Bad Slug','x',(select user_id from profiles limit 1));` → fails the `community_slug_shape` CHECK.
  - Insert a member row for that community, confirm `communities.member_count` became 1 (trigger); delete it, confirm back to 0.
  - `select public.community_role_of('<id>'::uuid, '<user>'::uuid);` returns the role.
  - Clean up: `delete from communities where slug='test-comm';` (cascades members).
  - Run `get_advisors` (security): no new ERROR (SECURITY DEFINER WARNs are expected/by-design like existing RPCs).
- [ ] **Step 4: Commit** — `git add supabase/migrations/0011_communities.sql && git commit -m "feat(db): communities core tables + membership/role RPCs"`

---

### Task 2: DB — community threads, pinning & moderation

**Files:**
- Create: `supabase/migrations/0012_community_threads.sql`
- Apply via `apply_migration` (name `0012_community_threads`).

**Interfaces:**
- Consumes: Task 1 tables + `community_role_of`.
- Produces: altered `public.discussion_threads` (`community_id uuid` nullable, `media_id` nullable, `is_pinned boolean`); RPCs `get_community_threads(uuid,int)`, `get_community_members(uuid)`, `create_community_thread(uuid,text,text) returns uuid`, `create_community_post(uuid,uuid,text)`, `set_thread_pinned(uuid,boolean)`, `moderate_remove_post(uuid)`, `moderate_delete_thread(uuid)`, `ban_member(uuid,uuid)`, `unban_member(uuid,uuid)`; updated `get_thread` returning `community_id` + `is_pinned`.

- [ ] **Step 1: Write the migration SQL** into `supabase/migrations/0012_community_threads.sql`:

```sql
-- supabase/migrations/0012_community_threads.sql
-- Slice B: community threads reuse discussion_threads/discussion_posts.
alter table public.discussion_threads
  add column if not exists community_id uuid references public.communities(id) on delete cascade,
  add column if not exists is_pinned boolean not null default false;
alter table public.discussion_threads alter column media_id drop not null;
alter table public.discussion_threads
  drop constraint if exists thread_one_parent;
alter table public.discussion_threads
  add constraint thread_one_parent check (
    (media_id is not null and community_id is null) or
    (media_id is null and community_id is not null)
  );
create index if not exists discussion_threads_community_idx
  on public.discussion_threads (community_id, is_pinned desc, last_activity_at desc);

-- Tighten inserts: direct insert may only create MEDIA threads/posts;
-- community writes go through SECURITY DEFINER RPCs (which bypass RLS).
drop policy if exists "insert own threads" on public.discussion_threads;
create policy "insert own threads" on public.discussion_threads
  for insert with check (auth.uid() = user_id and community_id is null);

drop policy if exists "insert own posts" on public.discussion_posts;
create policy "insert own posts" on public.discussion_posts
  for insert with check (
    auth.uid() = user_id and exists (
      select 1 from public.discussion_threads t
      where t.id = thread_id and t.community_id is null
    )
  );

-- get_thread now also returns community_id + is_pinned (additive).
create or replace function public.get_thread(p_thread_id uuid)
returns table (
  id uuid, media_id integer, community_id uuid, is_pinned boolean, user_id uuid,
  title text, body text, created_at timestamptz, last_activity_at timestamptz,
  username citext, display_name text, avatar_url text
)
language sql stable security definer set search_path = public as $$
  select t.id, t.media_id, t.community_id, t.is_pinned, t.user_id, t.title, t.body,
         t.created_at, t.last_activity_at, pr.username, pr.display_name, pr.avatar_url
  from public.discussion_threads t
  join public.profiles pr on pr.user_id = t.user_id
  where t.id = p_thread_id;
$$;

-- Threads for a community: pinned first, then most-recent activity.
create or replace function public.get_community_threads(p_community_id uuid, p_limit integer default 100)
returns table (
  id uuid, community_id uuid, is_pinned boolean, user_id uuid, title text,
  created_at timestamptz, last_activity_at timestamptz, reply_count bigint,
  username citext, display_name text, avatar_url text
)
language sql stable security definer set search_path = public as $$
  select t.id, t.community_id, t.is_pinned, t.user_id, t.title, t.created_at, t.last_activity_at,
         (select count(*) from public.discussion_posts p where p.thread_id = t.id) as reply_count,
         pr.username, pr.display_name, pr.avatar_url
  from public.discussion_threads t
  join public.profiles pr on pr.user_id = t.user_id
  where t.community_id = p_community_id
  order by t.is_pinned desc, t.last_activity_at desc
  limit p_limit;
$$;

create or replace function public.get_community_members(p_community_id uuid)
returns table (user_id uuid, role text, created_at timestamptz,
  username citext, display_name text, avatar_url text)
language sql stable security definer set search_path = public as $$
  select m.user_id, m.role, m.created_at, pr.username, pr.display_name, pr.avatar_url
  from public.community_members m
  join public.profiles pr on pr.user_id = m.user_id
  where m.community_id = p_community_id
  order by case m.role when 'owner' then 0 when 'moderator' then 1 else 2 end, m.created_at;
$$;

create or replace function public.create_community_thread(p_community_id uuid, p_title text, p_body text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_id uuid;
begin
  if public.community_role_of(p_community_id, v_uid) is null then raise exception 'not_member'; end if;
  if exists (select 1 from public.community_bans where community_id = p_community_id and user_id = v_uid)
    then raise exception 'banned'; end if;
  if char_length(btrim(p_title)) not between 1 and 200 then raise exception 'bad_title'; end if;
  if char_length(btrim(p_body))  not between 1 and 5000 then raise exception 'bad_body'; end if;
  insert into public.discussion_threads (community_id, user_id, title, body)
    values (p_community_id, v_uid, btrim(p_title), btrim(p_body)) returning id into v_id;
  return v_id;
end; $$;

create or replace function public.create_community_post(p_thread_id uuid, p_parent_post_id uuid, p_body text)
returns void language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_comm uuid;
begin
  select community_id into v_comm from public.discussion_threads where id = p_thread_id;
  if v_comm is null then raise exception 'not_community_thread'; end if;
  if public.community_role_of(v_comm, v_uid) is null then raise exception 'not_member'; end if;
  if exists (select 1 from public.community_bans where community_id = v_comm and user_id = v_uid)
    then raise exception 'banned'; end if;
  if char_length(btrim(p_body)) not between 1 and 5000 then raise exception 'bad_body'; end if;
  insert into public.discussion_posts (thread_id, user_id, parent_post_id, body)
    values (p_thread_id, v_uid, p_parent_post_id, btrim(p_body));
end; $$;

create or replace function public.set_thread_pinned(p_thread_id uuid, p_pinned boolean)
returns void language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_comm uuid; v_role text;
begin
  select community_id into v_comm from public.discussion_threads where id = p_thread_id;
  if v_comm is null then raise exception 'not_community_thread'; end if;
  v_role := public.community_role_of(v_comm, v_uid);
  if v_role not in ('owner','moderator') then raise exception 'forbidden'; end if;
  update public.discussion_threads set is_pinned = p_pinned where id = p_thread_id;
end; $$;

create or replace function public.moderate_remove_post(p_post_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_comm uuid; v_role text;
begin
  select t.community_id into v_comm
    from public.discussion_posts p join public.discussion_threads t on t.id = p.thread_id
    where p.id = p_post_id;
  if v_comm is null then raise exception 'not_community_post'; end if;
  v_role := public.community_role_of(v_comm, v_uid);
  if v_role not in ('owner','moderator') then raise exception 'forbidden'; end if;
  update public.discussion_posts set is_deleted = true, body = '' where id = p_post_id;
end; $$;

create or replace function public.moderate_delete_thread(p_thread_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_comm uuid; v_role text;
begin
  select community_id into v_comm from public.discussion_threads where id = p_thread_id;
  if v_comm is null then raise exception 'not_community_thread'; end if;
  v_role := public.community_role_of(v_comm, v_uid);
  if v_role not in ('owner','moderator') then raise exception 'forbidden'; end if;
  delete from public.discussion_threads where id = p_thread_id;
end; $$;

-- Ban: mods cannot ban the owner or another moderator; only the owner can.
create or replace function public.ban_member(p_community_id uuid, p_target uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_role text; v_target_role text;
begin
  v_role := public.community_role_of(p_community_id, v_uid);
  if v_role not in ('owner','moderator') then raise exception 'forbidden'; end if;
  v_target_role := public.community_role_of(p_community_id, p_target);
  if v_target_role = 'owner' then raise exception 'cannot_ban_owner'; end if;
  if v_target_role = 'moderator' and v_role <> 'owner' then raise exception 'forbidden'; end if;
  insert into public.community_bans (community_id, user_id, banned_by)
    values (p_community_id, p_target, v_uid)
    on conflict (community_id, user_id) do nothing;
  delete from public.community_members where community_id = p_community_id and user_id = p_target;
end; $$;

create or replace function public.unban_member(p_community_id uuid, p_target uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_role text;
begin
  v_role := public.community_role_of(p_community_id, v_uid);
  if v_role not in ('owner','moderator') then raise exception 'forbidden'; end if;
  delete from public.community_bans where community_id = p_community_id and user_id = p_target;
end; $$;

revoke all on function public.get_community_threads(uuid,integer) from public;
revoke all on function public.get_community_members(uuid) from public;
grant execute on function public.get_community_threads(uuid,integer) to anon, authenticated;
grant execute on function public.get_community_members(uuid) to anon, authenticated;
grant execute on function public.create_community_thread(uuid,text,text) to authenticated;
grant execute on function public.create_community_post(uuid,uuid,text) to authenticated;
grant execute on function public.set_thread_pinned(uuid,boolean) to authenticated;
grant execute on function public.moderate_remove_post(uuid) to authenticated;
grant execute on function public.moderate_delete_thread(uuid) to authenticated;
grant execute on function public.ban_member(uuid,uuid) to authenticated;
grant execute on function public.unban_member(uuid,uuid) to authenticated;
```

- [ ] **Step 2: Apply** via `apply_migration` (name `0012_community_threads`).
- [ ] **Step 3: Smoke-test** with `execute_sql`:
  - Create a community + a community thread row via `create_community_thread` is auth-gated (null uid) → expect `not_member`; instead insert directly with service role for structure: `insert into discussion_threads (community_id,user_id,title,body) values ('<cid>','<uid>','T','B') returning id;` succeeds; a row with BOTH `media_id` and `community_id` set → violates `thread_one_parent`.
  - `select * from get_community_threads('<cid>');` returns the thread with `is_pinned=false`.
  - `select * from get_thread('<tid>');` returns `community_id` + `is_pinned` columns.
  - Clean up the test community.
  - `get_advisors` (security): no new ERROR.
- [ ] **Step 4: Commit** — `git commit -m "feat(db): community threads, pinning & moderation RPCs"`

---

### Task 3: App layer — `src/lib/communities/*`

**Files:**
- Create: `src/lib/communities/types.ts`, `src/lib/communities/slug.ts`, `src/lib/communities/queries.ts`, `src/lib/communities/server.ts`
- Test: `src/lib/communities/__tests__/slug.test.ts`, `src/lib/communities/__tests__/queries.test.ts`, `src/lib/communities/__tests__/server.test.ts`

**Interfaces:**
- Consumes: `SupaLike` from `@/lib/sync/cloud`; `supabaseServer` from `@/lib/supabase/server`; `getThread`/`getThreadPosts` from `@/lib/discussions/queries`; `RESERVED_USERNAMES` from `@/lib/profile/username`.
- Produces (used by Tasks 4–7):
  - `types.ts`: `CommunityRole = "owner"|"moderator"|"member"`; `Community { id; slug; name; description; memberCount; createdBy; createdAt }`; `CommunityMember { userId; role: CommunityRole; username; displayName; avatarUrl }`.
  - `slug.ts`: `normalizeSlug(raw): string`; `validateSlug(raw): { ok: true; value: string } | { ok: false; error: "too_short"|"too_long"|"invalid_chars"|"reserved" }`.
  - `queries.ts`: `createCommunity(supabase, slug, name, description): Promise<{ok:true;id:string}|{ok:false;error:"slug_taken"|"invalid"|"unknown"}>`; `listCommunities(supabase, search?, limit?): Promise<Community[]>`; `getCommunityBySlug(supabase, slug): Promise<Community|null>`; `getMembers(supabase, communityId): Promise<CommunityMember[]>`; `getMyRole(supabase, communityId, userId): Promise<CommunityRole|null>`; `joinCommunity`/`leaveCommunity(supabase, communityId): Promise<{ok:true}|{ok:false;error}>`; `setMemberRole`, `banMember`, `unbanMember`, `deleteCommunity`, `setThreadPinned`, `moderateRemovePost`, `moderateDeleteThread` (each `{ok:true}|{ok:false;error}`); `createCommunityThread(supabase, communityId, title, body): Promise<{ok:true;id:string}|{ok:false;error}>`; `createCommunityPost(supabase, threadId, parentPostId, body): Promise<{ok:true}|{ok:false;error}>`; `listCommunityThreads(supabase, communityId, limit?): Promise<DiscussionThread[]>`.
  - `server.ts`: `loadCommunityPage(slug, viewerId): Promise<{state:"not_found"}|{state:"ok"; community: Community; viewerRole: CommunityRole|null; threads: DiscussionThread[]}>`; `loadCommunityThread(slug, threadId): Promise<{state:"not_found"}|{state:"ok"; community: Community; thread: DiscussionThread; posts: DiscussionPost[]; viewerRole: CommunityRole|null}>`.

- [ ] **Step 1: Write failing tests for `slug.ts`** (`src/lib/communities/__tests__/slug.test.ts`):

```ts
import { describe, it, expect } from "vitest";
import { validateSlug, normalizeSlug } from "@/lib/communities/slug";

describe("validateSlug", () => {
  it("lowercases + trims", () => { expect(normalizeSlug("  Isekai_Fans ")).toBe("isekai_fans"); });
  it("accepts a valid slug", () => { expect(validateSlug("isekai-fans")).toEqual({ ok: true, value: "isekai-fans" }); });
  it("rejects too short", () => { expect(validateSlug("ab")).toEqual({ ok: false, error: "too_short" }); });
  it("rejects too long", () => { expect(validateSlug("a".repeat(31))).toEqual({ ok: false, error: "too_long" }); });
  it("rejects bad chars", () => { expect(validateSlug("bad slug!")).toEqual({ ok: false, error: "invalid_chars" }); });
  it("rejects reserved", () => { expect(validateSlug("new")).toEqual({ ok: false, error: "reserved" }); });
});
```

- [ ] **Step 2: Run to fail** — `npx vitest run src/lib/communities/__tests__/slug.test.ts`
- [ ] **Step 3: Implement `types.ts` and `slug.ts`**:

```ts
// src/lib/communities/types.ts
export type CommunityRole = "owner" | "moderator" | "member";
export interface Community {
  id: string; slug: string; name: string; description: string;
  memberCount: number; createdBy: string; createdAt: string;
}
export interface CommunityMember {
  userId: string; role: CommunityRole;
  username: string; displayName: string | null; avatarUrl: string | null;
}
```

```ts
// src/lib/communities/slug.ts
import { RESERVED_USERNAMES } from "@/lib/profile/username";

export type SlugError = "too_short" | "too_long" | "invalid_chars" | "reserved";
const EXTRA_RESERVED = new Set<string>(["new", "manage", "settings", "communities"]);

export function normalizeSlug(raw: string): string {
  return raw.trim().toLowerCase();
}

export function validateSlug(raw: string): { ok: true; value: string } | { ok: false; error: SlugError } {
  const value = normalizeSlug(raw);
  if (value.length < 3) return { ok: false, error: "too_short" };
  if (value.length > 30) return { ok: false, error: "too_long" };
  if (!/^[a-z0-9_-]+$/.test(value)) return { ok: false, error: "invalid_chars" };
  if (RESERVED_USERNAMES.has(value) || EXTRA_RESERVED.has(value)) return { ok: false, error: "reserved" };
  return { ok: true, value };
}
```

- [ ] **Step 4: Run to pass** — `npx vitest run src/lib/communities/__tests__/slug.test.ts`
- [ ] **Step 5: Write failing tests for `queries.ts`** (`src/lib/communities/__tests__/queries.test.ts`) — mirror `discussions/__tests__/queries.test.ts`. Cover: `listCommunities` maps rows + applies `sanitizeTerm`-style trimming and returns `[]` for <2 char search; `getCommunityBySlug` returns null when no row; `createCommunity` returns `{ok:false,error:"slug_taken"}` when rpc error message contains `communities_slug_key`/`duplicate`; `joinCommunity` maps a `banned` rpc error to `{ok:false,error:"banned"}`; `createCommunityThread` returns `{ok:true,id}` on success. Example:

```ts
import { describe, it, expect, vi } from "vitest";
import { listCommunities, joinCommunity, createCommunityThread } from "@/lib/communities/queries";

describe("listCommunities", () => {
  it("maps rows and orders by member_count via the query builder", async () => {
    const rows = [{ id: "c1", slug: "isekai", name: "Isekai", description: "", member_count: 3, created_by: "u1", created_at: "t" }];
    const builder = {
      select: () => builder, or: () => builder, order: () => builder,
      limit: async () => ({ data: rows, error: null }),
    };
    const supabase = { from: () => builder } as never;
    const out = await listCommunities(supabase);
    expect(out[0]).toMatchObject({ id: "c1", slug: "isekai", memberCount: 3 });
  });
});

describe("joinCommunity", () => {
  it("maps a banned rpc error", async () => {
    const supabase = { rpc: async () => ({ error: { message: "banned" } }) } as never;
    expect(await joinCommunity(supabase, "c1")).toEqual({ ok: false, error: "banned" });
  });
  it("returns ok on success", async () => {
    const supabase = { rpc: async () => ({ error: null }) } as never;
    expect(await joinCommunity(supabase, "c1")).toEqual({ ok: true });
  });
});

describe("createCommunityThread", () => {
  it("returns the new id", async () => {
    const supabase = { rpc: async () => ({ data: "t1", error: null }) } as never;
    expect(await createCommunityThread(supabase, "c1", "T", "B")).toEqual({ ok: true, id: "t1" });
  });
});
```

- [ ] **Step 6: Run to fail** — `npx vitest run src/lib/communities/__tests__/queries.test.ts`
- [ ] **Step 7: Implement `queries.ts`.** Read helpers throw on `error`; mutation helpers return the `{ok}` shape mapping known rpc error messages. Full file:

```ts
// src/lib/communities/queries.ts
import type { SupaLike } from "@/lib/sync/cloud";
import type { DiscussionThread } from "@/lib/discussions/types";
import type { Community, CommunityMember, CommunityRole } from "./types";

interface CommunityRow { id: string; slug: string; name: string; description: string; member_count: number; created_by: string; created_at: string }
const COMMUNITY_COLS = "id, slug, name, description, member_count, created_by, created_at";

function mapCommunity(r: CommunityRow): Community {
  return { id: r.id, slug: r.slug, name: r.name, description: r.description, memberCount: Number(r.member_count), createdBy: r.created_by, createdAt: r.created_at };
}
function sanitize(q: string): string { return q.trim().replace(/[^\p{L}\p{N} _-]/gu, ""); }

export async function listCommunities(supabase: SupaLike, search = "", limit = 50): Promise<Community[]> {
  let query = supabase.from("communities").select(COMMUNITY_COLS);
  const t = sanitize(search);
  if (t.length >= 2) query = query.or(`slug.ilike.%${t}%,name.ilike.%${t}%`);
  const { data, error } = await query.order("member_count", { ascending: false }).limit(limit);
  if (error) throw error;
  return ((data ?? []) as CommunityRow[]).map(mapCommunity);
}

export async function getCommunityBySlug(supabase: SupaLike, slug: string): Promise<Community | null> {
  const { data, error } = await supabase.from("communities").select(COMMUNITY_COLS).eq("slug", slug).limit(1);
  if (error) throw error;
  const rows = (data ?? []) as CommunityRow[];
  return rows.length ? mapCommunity(rows[0]) : null;
}

export async function getMembers(supabase: SupaLike, communityId: string): Promise<CommunityMember[]> {
  const { data, error } = await supabase.rpc("get_community_members", { p_community_id: communityId });
  if (error) throw error;
  return ((data ?? []) as { user_id: string; role: CommunityRole; username: string; display_name: string | null; avatar_url: string | null }[])
    .filter((r) => r.username)
    .map((r) => ({ userId: r.user_id, role: r.role, username: r.username, displayName: r.display_name, avatarUrl: r.avatar_url }));
}

export async function getMyRole(supabase: SupaLike, communityId: string, userId: string): Promise<CommunityRole | null> {
  const { data, error } = await supabase.from("community_members").select("role").eq("community_id", communityId).eq("user_id", userId).limit(1);
  if (error) throw error;
  const rows = (data ?? []) as { role: CommunityRole }[];
  return rows.length ? rows[0].role : null;
}

export async function listCommunityThreads(supabase: SupaLike, communityId: string, limit = 100): Promise<DiscussionThread[]> {
  const { data, error } = await supabase.rpc("get_community_threads", { p_community_id: communityId, p_limit: limit });
  if (error) throw error;
  return ((data ?? []) as Record<string, unknown>[])
    .filter((r) => r.username)
    .map((r) => ({
      id: r.id as string, mediaId: 0, userId: r.user_id as string, title: r.title as string,
      createdAt: r.created_at as string, lastActivityAt: r.last_activity_at as string,
      replyCount: Number(r.reply_count), username: r.username as string,
      displayName: (r.display_name as string) ?? null, avatarUrl: (r.avatar_url as string) ?? null,
      communityId: r.community_id as string, isPinned: Boolean(r.is_pinned),
    }));
}

type Mut = { ok: true } | { ok: false; error: string };
async function callVoid(supabase: SupaLike, fn: string, args: Record<string, unknown>): Promise<Mut> {
  const { error } = await supabase.rpc(fn, args);
  if (!error) return { ok: true };
  return { ok: false, error: error.message ?? "unknown" };
}

export async function createCommunity(supabase: SupaLike, slug: string, name: string, description: string): Promise<{ ok: true; id: string } | { ok: false; error: "slug_taken" | "invalid" | "unknown" }> {
  const { data, error } = await supabase.rpc("create_community", { p_slug: slug, p_name: name, p_description: description });
  if (!error) return { ok: true, id: data as string };
  const msg = (error.message ?? "").toLowerCase();
  if (msg.includes("duplicate") || msg.includes("unique") || msg.includes("slug")) return { ok: false, error: "slug_taken" };
  if (msg.includes("check") || msg.includes("violates")) return { ok: false, error: "invalid" };
  return { ok: false, error: "unknown" };
}

export const joinCommunity = (s: SupaLike, id: string) => callVoid(s, "join_community", { p_community_id: id });
export const leaveCommunity = (s: SupaLike, id: string) => callVoid(s, "leave_community", { p_community_id: id });
export const deleteCommunity = (s: SupaLike, id: string) => callVoid(s, "delete_community", { p_community_id: id });
export const setMemberRole = (s: SupaLike, id: string, target: string, role: CommunityRole) => callVoid(s, "set_member_role", { p_community_id: id, p_target: target, p_role: role });
export const banMember = (s: SupaLike, id: string, target: string) => callVoid(s, "ban_member", { p_community_id: id, p_target: target });
export const unbanMember = (s: SupaLike, id: string, target: string) => callVoid(s, "unban_member", { p_community_id: id, p_target: target });
export const setThreadPinned = (s: SupaLike, threadId: string, pinned: boolean) => callVoid(s, "set_thread_pinned", { p_thread_id: threadId, p_pinned: pinned });
export const moderateRemovePost = (s: SupaLike, postId: string) => callVoid(s, "moderate_remove_post", { p_post_id: postId });
export const moderateDeleteThread = (s: SupaLike, threadId: string) => callVoid(s, "moderate_delete_thread", { p_thread_id: threadId });

export async function createCommunityThread(supabase: SupaLike, communityId: string, title: string, body: string): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const { data, error } = await supabase.rpc("create_community_thread", { p_community_id: communityId, p_title: title, p_body: body });
  if (error) return { ok: false, error: error.message ?? "unknown" };
  return { ok: true, id: data as string };
}
export const createCommunityPost = (s: SupaLike, threadId: string, parentPostId: string | null, body: string) =>
  callVoid(s, "create_community_post", { p_thread_id: threadId, p_parent_post_id: parentPostId, p_body: body });
```

> The `DiscussionThread` type needs `communityId?` and `isPinned?` optional fields —
> add them in this task (edit `src/lib/discussions/types.ts`): `communityId?: string`
> and `isPinned?: boolean` on the `DiscussionThread` interface. Existing media mappers
> leave them undefined; no other change needed.

- [ ] **Step 8: Run to pass** — `npx vitest run src/lib/communities/__tests__/queries.test.ts`
- [ ] **Step 9: Write failing tests for `server.ts`** (`src/lib/communities/__tests__/server.test.ts`) — mock `@/lib/supabase/server` and `./queries`; assert `loadCommunityPage` returns `not_found` when `getCommunityBySlug` is null, and `ok` with `viewerRole` + `threads` when present; `loadCommunityThread` returns `not_found` when the thread's `communityId` doesn't match the slug's community id. Use `vi.mock`.
- [ ] **Step 10: Implement `server.ts`**:

```ts
// src/lib/communities/server.ts
import { supabaseServer } from "@/lib/supabase/server";
import { getThread, getThreadPosts } from "@/lib/discussions/queries";
import { getCommunityBySlug, getMyRole, listCommunityThreads } from "./queries";
import type { Community, CommunityRole } from "./types";
import type { DiscussionThread, DiscussionPost } from "@/lib/discussions/types";

export type CommunityPageState =
  | { state: "not_found" }
  | { state: "ok"; community: Community; viewerRole: CommunityRole | null; threads: DiscussionThread[] };

export async function loadCommunityPage(slug: string, viewerId: string | null): Promise<CommunityPageState> {
  const supabase = await supabaseServer();
  const community = await getCommunityBySlug(supabase as never, slug);
  if (!community) return { state: "not_found" };
  const [viewerRole, threads] = await Promise.all([
    viewerId ? getMyRole(supabase as never, community.id, viewerId) : Promise.resolve(null),
    listCommunityThreads(supabase as never, community.id),
  ]);
  return { state: "ok", community, viewerRole, threads };
}

export type CommunityThreadState =
  | { state: "not_found" }
  | { state: "ok"; community: Community; thread: DiscussionThread; posts: DiscussionPost[]; viewerRole: CommunityRole | null };

export async function loadCommunityThread(slug: string, threadId: string, viewerId: string | null): Promise<CommunityThreadState> {
  const supabase = await supabaseServer();
  const community = await getCommunityBySlug(supabase as never, slug);
  if (!community) return { state: "not_found" };
  const thread = await getThread(supabase as never, threadId);
  if (!thread || thread.communityId !== community.id) return { state: "not_found" };
  const [posts, viewerRole] = await Promise.all([
    getThreadPosts(supabase as never, threadId),
    viewerId ? getMyRole(supabase as never, community.id, viewerId) : Promise.resolve(null),
  ]);
  return { state: "ok", community, thread, posts, viewerRole };
}
```

> `getThread`'s mapper must now also carry `communityId` + `isPinned`. Edit
> `src/lib/discussions/queries.ts` `mapThread` + its `ThreadRow` interface to include
> `community_id?: string | null` and `is_pinned?: boolean`, mapping to `communityId` /
> `isPinned`. This is additive and leaves media threads working.

- [ ] **Step 11: Run to pass + full suite + tsc** — `npx vitest run src/lib/communities/__tests__/` then `npm test` then `npx tsc --noEmit`.
- [ ] **Step 12: Commit** — `git commit -m "feat(communities): app layer (types, slug, queries, server)"`

---

### Task 4: UI — directory + create + nav link

**Files:**
- Create: `src/app/communities/page.tsx`, `src/app/communities/new/page.tsx`, `src/components/communities/CommunityDirectory.tsx`, `src/components/communities/CreateCommunityForm.tsx`
- Modify: `src/components/Navbar.tsx` (add a "Communities" nav item), `src/app/layout.tsx` bottom-safe grid if needed
- Test: `src/components/communities/__tests__/CreateCommunityForm.test.tsx`

**Interfaces:**
- Consumes: `listCommunities`, `createCommunity` (Task 3); `validateSlug` (Task 3); `supabaseBrowser`, `isSupabaseConfigured`.
- Produces: routes `/communities`, `/communities/new`.

- [ ] **Step 1: Add the page metadata + directory route.** `src/app/communities/page.tsx` (server component):

```tsx
import { PageHead } from "@/components/editorial";
import { CommunityDirectory } from "@/components/communities/CommunityDirectory";

export const metadata = { title: "Communities" };

export default function CommunitiesPage() {
  return (
    <div className="mx-auto max-w-[1560px] space-y-8 px-6 py-12 sm:px-10">
      <PageHead kicker="COMMUNITIES · FIND YOUR PEOPLE" accent="violet">Communities</PageHead>
      <CommunityDirectory />
    </div>
  );
}
```

- [ ] **Step 2: Implement `CommunityDirectory.tsx`** — client component mirroring `src/components/discover/UserSearch.tsx` + `DiscussionBoard`'s load pattern: on mount `listCommunities(supabaseBrowser())`, a search box that re-queries (debounce optional), a "Create community" `Link` to `/communities/new`, and a list of cards (`Link href={`/communities/${c.slug}`}` showing name, description, `{memberCount} members`). Handle `unconfigured`/`loading`/`error`/empty exactly like `DiscussionBoard` (skeletons + dashed empty card). Render text as plain text.
- [ ] **Step 3: Write failing test for `CreateCommunityForm`** (`__tests__/CreateCommunityForm.test.tsx`): mock `@/lib/communities/queries` `createCommunity` and `next/navigation` `useRouter`; typing an invalid slug (`"ab"`) shows "at least 3 characters" and does not call `createCommunity`; a valid submit calls `createCommunity` and routes to `/communities/<slug>`; a `{ok:false,error:"slug_taken"}` result shows "That URL is taken." Mirror `SearchControls.test.tsx` style.
- [ ] **Step 4: Run to fail** — `npx vitest run src/components/communities/__tests__/CreateCommunityForm.test.tsx`
- [ ] **Step 5: Implement `CreateCommunityForm.tsx`** — client form (slug, name, description) using `validateSlug` for live feedback; on submit calls `createCommunity(supabaseBrowser(), slug, name, description)`; on `{ok:true}` `router.push(`/communities/${slug}`)`; maps errors (`slug_taken`→"That URL is taken.", `invalid`→"Check the name and description.", else generic). Gate on sign-in (`supabaseBrowser().auth.getUser()`), showing "Sign in to create a community." when signed out. And `src/app/communities/new/page.tsx`:

```tsx
import { PageHead } from "@/components/editorial";
import { CreateCommunityForm } from "@/components/communities/CreateCommunityForm";

export const metadata = { title: "Create a community" };

export default function NewCommunityPage() {
  return (
    <div className="mx-auto max-w-[720px] space-y-8 px-6 py-12 sm:px-10">
      <PageHead kicker="COMMUNITIES · NEW" accent="pink">Create a community</PageHead>
      <CreateCommunityForm />
    </div>
  );
}
```

- [ ] **Step 6: Add the Navbar item.** In `src/components/Navbar.tsx` add to the `NAV` array: `{ href: "/communities", label: "Groups", Icon: CompassIcon }` (reuse an existing icon from `@/components/icons`; pick one not already used, e.g. `UsersIcon`/`CompassIcon` — check the import list). Update any hardcoded mobile `grid-cols-N` count in `Navbar.tsx`/`layout.tsx` to fit the new item (search for `grid-cols-` in `Navbar.tsx`).
- [ ] **Step 7: Run to pass + tsc + build** — `npx vitest run src/components/communities/__tests__/`; `npm test`; `npx tsc --noEmit`; `npm run build`.
- [ ] **Step 8: Commit** — `git commit -m "feat(communities): directory + create page + nav link"`

---

### Task 5: UI — community page + board (membership-gated posting)

**Files:**
- Create: `src/app/communities/[slug]/page.tsx`, `src/components/communities/CommunityHeader.tsx`, `src/components/communities/CommunityBoard.tsx`
- Test: `src/components/communities/__tests__/CommunityBoard.test.tsx`

**Interfaces:**
- Consumes: `loadCommunityPage` (server, Task 3); `joinCommunity`/`leaveCommunity`/`createCommunityThread`/`listCommunityThreads` (Task 3).
- Produces: route `/communities/[slug]`.

- [ ] **Step 1: Add the route** `src/app/communities/[slug]/page.tsx` (server component with `generateMetadata` via `pageMetadata` from `@/lib/seo`):

```tsx
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { pageMetadata } from "@/lib/seo";
import { supabaseServer } from "@/lib/supabase/server";
import { loadCommunityPage } from "@/lib/communities/server";
import { CommunityHeader } from "@/components/communities/CommunityHeader";
import { CommunityBoard } from "@/components/communities/CommunityBoard";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const supabase = await supabaseServer();
  const { getCommunityBySlug } = await import("@/lib/communities/queries");
  try {
    const c = await getCommunityBySlug(supabase as never, slug);
    if (!c) return {};
    return pageMetadata({ title: c.name, description: c.description || `The ${c.name} community on Animood.` });
  } catch { return {}; }
}

export default async function CommunityPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = await supabaseServer();
  const { data } = await supabase.auth.getUser();
  const res = await loadCommunityPage(slug, data.user?.id ?? null);
  if (res.state === "not_found") notFound();
  return (
    <div className="mx-auto max-w-[1560px] space-y-8 px-6 py-12 sm:px-10">
      <CommunityHeader community={res.community} viewerRole={res.viewerRole} />
      <CommunityBoard community={res.community} viewerRole={res.viewerRole} initialThreads={res.threads} />
    </div>
  );
}
```

- [ ] **Step 2: Implement `CommunityHeader.tsx`** — client component: shows name, description, `{memberCount} members`; a Join/Leave button driven by `viewerRole` (null → "Join" calls `joinCommunity`; member/mod → "Leave" calls `leaveCommunity`, hidden for owner); a "Manage" `Link` to `/communities/${slug}/manage` shown when `viewerRole` is `owner`/`moderator`. After a join/leave call, `router.refresh()`. Gate the Join button on sign-in.
- [ ] **Step 3: Write failing test for `CommunityBoard`** (`__tests__/CommunityBoard.test.tsx`): with `viewerRole={null}` the new-thread composer is NOT rendered and a "Join to start a thread" note shows; with `viewerRole="member"` the composer renders; submitting calls `createCommunityThread` and routes to the thread. Mock `@/lib/communities/queries` + `next/navigation`.
- [ ] **Step 4: Run to fail** — `npx vitest run src/components/communities/__tests__/CommunityBoard.test.tsx`
- [ ] **Step 5: Implement `CommunityBoard.tsx`** — mirror `DiscussionBoard.tsx`, but:
  - props `{ community: Community; viewerRole: CommunityRole | null; initialThreads: DiscussionThread[] }`.
  - the composer renders only when `viewerRole !== null` (member+); otherwise show "Join to start a thread." (signed-in, not member) or "Sign in to join the conversation." (signed-out).
  - create via `createCommunityThread(supabaseBrowser(), community.id, title, body)`; on `{ok:true}` `router.push(`/communities/${community.slug}/${id}`)`; map the rpc error strings (`not_member`,`banned`,`bad_title`,`bad_body`) to copy.
  - `ThreadRow` links to `/communities/${community.slug}/${thread.id}` and shows a 📌 marker when `thread.isPinned`.
- [ ] **Step 6: Run to pass + tsc + build** — vitest file, `npm test`, `npx tsc --noEmit`, `npm run build`.
- [ ] **Step 7: Commit** — `git commit -m "feat(communities): community page + membership-gated board"`

---

### Task 6: UI — community thread page (reuse ThreadView + moderation)

**Files:**
- Create: `src/app/communities/[slug]/[threadId]/page.tsx`
- Modify: `src/components/discussions/ThreadView.tsx` (inject reply/moderation handlers)
- Test: extend `src/components/discussions/__tests__/` with a ThreadView moderation test if one exists, else `src/components/communities/__tests__/CommunityThreadView.test.tsx`

**Interfaces:**
- Consumes: `loadCommunityThread` (Task 3); `createCommunityPost`, `moderateRemovePost`, `moderateDeleteThread`, `setThreadPinned` (Task 3).
- Produces: route `/communities/[slug]/[threadId]`.

- [ ] **Step 1: Refactor `ThreadView` to accept optional injected handlers** (keeps Slice A media behavior when absent). Change its props to:

```tsx
export function ThreadView({
  threadId,
  initialPosts,
  createReply,          // optional: (threadId, parentPostId, body) => Promise<{ok:true}|{ok:false;error}>
  canReply = true,      // optional: when false, hide the top composer + per-post Reply
  canModerate = false,  // optional: show mod "Remove" on others' posts
  onModerateRemove,     // optional: (postId) => Promise<void>
}: {
  threadId: string;
  initialPosts: DiscussionPost[];
  createReply?: (threadId: string, parentPostId: string | null, body: string) => Promise<{ ok: true } | { ok: false; error: "empty" | "too_long" | "unknown" | string }>;
  canReply?: boolean;
  canModerate?: boolean;
  onModerateRemove?: (postId: string) => Promise<void>;
}) { /* ... */ }
```

Default `createReply` to the existing media path so current callers are unchanged:
```tsx
const reply = createReply ?? ((tid, pid, body) => createPost(supabaseBrowser(), "", tid, pid, body));
```
> NOTE: `createPost` needs the userId; the media path currently passes `viewerId`. Keep
> the existing internal `createPost(supabaseBrowser(), viewerId, threadId, parent, body)`
> call as the default when `createReply` is not provided, rather than the sketch above —
> i.e. branch: `const doReply = createReply ? (pid,body)=>createReply(threadId,pid,body) : (pid,body)=>createPost(supabaseBrowser(), viewerId as string, threadId, pid, body);` and call `doReply` in both the top composer and `PostItem`'s reply handler. Pass `canModerate`/`onModerateRemove` down to `PostItem`, which renders a "Remove" button (calls `onModerateRemove`) on posts the viewer doesn't own when `canModerate` and `!node.isDeleted`.

Verify the existing `ThreadView` tests still pass unchanged (media path). Add a test asserting: when `canModerate` + `onModerateRemove` are passed, a "Remove" button appears on another user's post and calls the handler; when `createReply` is passed, submitting a reply calls it instead of `createPost`.

- [ ] **Step 2: Run existing ThreadView/discussions tests to confirm no regression** — `npx vitest run src/components/discussions/__tests__/`
- [ ] **Step 3: Add the community thread route** `src/app/communities/[slug]/[threadId]/page.tsx`:

```tsx
import { notFound } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { loadCommunityThread } from "@/lib/communities/server";
import { CommunityThreadView } from "@/components/communities/CommunityThreadView";

export default async function CommunityThreadPage({ params }: { params: Promise<{ slug: string; threadId: string }> }) {
  const { slug, threadId } = await params;
  const supabase = await supabaseServer();
  const { data } = await supabase.auth.getUser();
  const res = await loadCommunityThread(slug, threadId, data.user?.id ?? null);
  if (res.state === "not_found") notFound();
  return (
    <div className="mx-auto max-w-[900px] space-y-6 px-6 py-12 sm:px-10">
      <div>
        <p className="mono text-[11px] tracking-[0.14em] text-violet">
          <a href={`/communities/${slug}`} className="hover:underline">{res.community.name.toUpperCase()}</a>
        </p>
        <h1 className="mt-2 text-3xl font-black tracking-tight">{res.thread.title}</h1>
        {res.thread.body ? <p className="mt-3 whitespace-pre-wrap text-muted-foreground">{res.thread.body}</p> : null}
      </div>
      <CommunityThreadView
        slug={slug}
        thread={res.thread}
        initialPosts={res.posts}
        viewerRole={res.viewerRole}
      />
    </div>
  );
}
```

- [ ] **Step 4: Implement `CommunityThreadView.tsx`** (`src/components/communities/`) — a thin client wrapper that renders pin/remove controls for owner/mod and delegates to `ThreadView`:

```tsx
"use client";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";
import { ThreadView } from "@/components/discussions/ThreadView";
import { createCommunityPost, moderateRemovePost, moderateDeleteThread, setThreadPinned } from "@/lib/communities/queries";
import type { DiscussionThread, DiscussionPost } from "@/lib/discussions/types";
import type { CommunityRole } from "@/lib/communities/types";

export function CommunityThreadView({ slug, thread, initialPosts, viewerRole }: {
  slug: string; thread: DiscussionThread; initialPosts: DiscussionPost[]; viewerRole: CommunityRole | null;
}) {
  const router = useRouter();
  const isMod = viewerRole === "owner" || viewerRole === "moderator";
  return (
    <div className="space-y-3">
      {isMod ? (
        <div className="flex gap-2">
          <button type="button" onClick={async () => { await setThreadPinned(supabaseBrowser(), thread.id, !thread.isPinned); router.refresh(); }}
            className="mono rounded-full border border-border-strong px-3 py-1.5 text-[11px]">
            {thread.isPinned ? "Unpin" : "Pin"}
          </button>
          <button type="button" onClick={async () => { if (window.confirm("Remove this thread?")) { await moderateDeleteThread(supabaseBrowser(), thread.id); router.push(`/communities/${slug}`); } }}
            className="mono rounded-full border border-border-strong px-3 py-1.5 text-[11px] text-pink">
            Remove thread
          </button>
        </div>
      ) : null}
      <ThreadView
        threadId={thread.id}
        initialPosts={initialPosts}
        canReply={viewerRole !== null}
        createReply={viewerRole ? (tid, pid, body) => createCommunityPost(supabaseBrowser(), tid, pid, body) : undefined}
        canModerate={isMod}
        onModerateRemove={async (postId) => { await moderateRemovePost(supabaseBrowser(), postId); }}
      />
    </div>
  );
}
```

> If `viewerRole` is null (non-member), `createReply` is undefined → `ThreadView` falls
> back to the media `createPost` path, which will fail RLS for a community thread. To
> avoid a confusing failure, when `viewerRole` is null the reply composer must be
> hidden: pass a prop `canReply={viewerRole !== null}` to `ThreadView` and gate both the
> top composer and per-post Reply buttons on it (add `canReply = true` to ThreadView
> props in Step 1, defaulting true for the media path). Update the Step-1 test to cover
> `canReply={false}` hiding the composer.

- [ ] **Step 5: Run to pass + tsc + build** — `npm test`, `npx tsc --noEmit`, `npm run build`.
- [ ] **Step 6: Commit** — `git commit -m "feat(communities): community thread page + ThreadView moderation hooks"`

---

### Task 7: UI — manage panel (roles, bans, edit, delete)

**Files:**
- Create: `src/app/communities/[slug]/manage/page.tsx`, `src/components/communities/CommunityManagePanel.tsx`
- Test: `src/components/communities/__tests__/CommunityManagePanel.test.tsx`

**Interfaces:**
- Consumes: `getMembers`, `setMemberRole`, `banMember`, `unbanMember`, `deleteCommunity` (Task 3); `loadCommunityPage` for the guard.
- Produces: route `/communities/[slug]/manage`.

- [ ] **Step 1: Add the guarded route** `src/app/communities/[slug]/manage/page.tsx`:

```tsx
import { notFound, redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { loadCommunityPage } from "@/lib/communities/server";
import { getMembers } from "@/lib/communities/queries";
import { CommunityManagePanel } from "@/components/communities/CommunityManagePanel";

export const metadata = { title: "Manage community" };

export default async function ManagePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = await supabaseServer();
  const { data } = await supabase.auth.getUser();
  const res = await loadCommunityPage(slug, data.user?.id ?? null);
  if (res.state === "not_found") notFound();
  if (res.viewerRole !== "owner" && res.viewerRole !== "moderator") redirect(`/communities/${slug}`);
  const members = await getMembers(supabase as never, res.community.id);
  return (
    <div className="mx-auto max-w-[900px] space-y-8 px-6 py-12 sm:px-10">
      <CommunityManagePanel community={res.community} viewerRole={res.viewerRole} initialMembers={members} />
    </div>
  );
}
```

- [ ] **Step 2: Write failing test for `CommunityManagePanel`** (`__tests__/CommunityManagePanel.test.tsx`): as `owner`, each non-owner member row shows Promote/Demote + Ban; clicking Promote calls `setMemberRole(_, _, memberUserId, "moderator")`; the "Delete community" button appears only for `owner` and calls `deleteCommunity` after confirm; as `moderator`, role controls are hidden but Ban (on plain members) shows. Mock `@/lib/communities/queries` + `next/navigation`.
- [ ] **Step 3: Run to fail** — `npx vitest run src/components/communities/__tests__/CommunityManagePanel.test.tsx`
- [ ] **Step 4: Implement `CommunityManagePanel.tsx`** — client component listing members (avatar, @username, role badge); for the `owner` viewer, each non-owner row has Promote→moderator / Demote→member (`setMemberRole`) and Ban (`banMember`); for a `moderator` viewer, show Ban only on `member` rows (hide role controls and actions on owner/mod rows); a "Delete community" button (owner only) calls `deleteCommunity` after `window.confirm`, then `router.push("/communities")`. After any action, `router.refresh()`. Map rpc errors (`forbidden`, `cannot_target_owner`, `cannot_ban_owner`) to a small inline error line. All names plain text.
- [ ] **Step 5: Run to pass + tsc + build** — `npm test`, `npx tsc --noEmit`, `npm run build`.
- [ ] **Step 6: Commit** — `git commit -m "feat(communities): manage panel (roles, bans, delete)"`

---

## Post-implementation verification (whole feature)

- [ ] `npm test` green; `npx tsc --noEmit` clean; `npm run build` exit 0.
- [ ] **End-to-end authz smoke test against the live DB** (the 0009 lesson — exercise real RPCs as real users, not just as the service role). Using two test accounts (or the Supabase SQL editor with `set request.jwt.claims`), confirm:
  - creator of a community is `owner`; a second user can `join` then `create_community_thread` + reply; a non-member's `create_community_thread`/`create_community_post` raise `not_member`.
  - `ban_member` blocks the banned user from posting and from `join` (raises `banned`); `unban_member` restores join.
  - a `moderator` can `moderate_remove_post`, `moderate_delete_thread`, `set_thread_pinned`; a plain `member` gets `forbidden`.
  - only the `owner` can `set_member_role` and `delete_community`; a moderator gets `forbidden`; a moderator cannot `ban_member` another moderator.
  - the `thread_one_parent` CHECK rejects a thread with both parents; a direct client insert into `discussion_threads` with a `community_id` is blocked by the tightened RLS policy.
- [ ] Live UI pass on the deployed preview: create a community, join from a second account, post a thread + nested reply, pin it, remove a post as mod, ban the second account, delete the community.
- [ ] Merge to master; the media discussion boards (Slice A) still work unchanged.

## Deferred (post-v1, per spec §11)

Private/members-only communities; join requests & invites; ownership transfer; community rules/flair; notifications; per-community home feed; thread search within a community; richer pagination; community avatars/banners; cross-posting from a media page.
