# Animood — Per-Anime Discussion Boards Design Spec

**Date:** 2026-09-07
**Status:** Approved (owner delegated design), ready for implementation planning
**Scope:** Per-anime threaded discussion boards (Communities — Slice A). Slice B (user-created topic communities) is deferred.

## 1. Vision

Give every title a discussion board: users start **threads** on an anime/manga and hold
**nested (Reddit-style) reply** conversations, read on a dedicated thread page. This is the
first "communities" slice; it coexists with the existing flat comment section (Comments =
quick takes, Discussions = threaded conversation) and builds the thread/post primitive that
the later user-created-communities slice (Slice B) will reuse.

Built on the existing accounts/profiles stack + RLS, mirroring the comments/feed patterns.

## 2. Decisions (owner-delegated)

- **Two models planned; this is Slice A (per-anime boards). Slice B (user-created topic
  communities) is a separate later slice** that reuses this slice's thread/post primitive.
- **Coexists with the existing flat Comments** — a separate "Discussions" section is added;
  the shipped `CommentSection` is untouched.
- **Nested reply trees** (a post replies to the thread or to another post).
- **Read on a dedicated thread page** (`/media/[id]/discussions/[threadId]`); the media page
  shows the thread list.
- **Post deletion is soft** ("[deleted]", children survive); **thread deletion is a hard
  cascade** (author-only). Editing is deferred.
- **Author attribution regardless of profile privacy** (consistent with comments) via
  `SECURITY DEFINER` read RPCs.

## 3. Data model (Supabase)

### `discussion_threads`

```sql
create table public.discussion_threads (
  id               uuid        not null default gen_random_uuid() primary key,
  media_id         integer     not null,
  user_id          uuid        not null references public.profiles(user_id) on delete cascade,
  title            text        not null,
  body             text        not null,
  created_at       timestamptz not null default now(),
  last_activity_at timestamptz not null default now(),
  constraint thread_title_len check (char_length(btrim(title)) between 1 and 200),
  constraint thread_body_len  check (char_length(btrim(body))  between 1 and 5000)
);
create index discussion_threads_media_activity_idx
  on public.discussion_threads (media_id, last_activity_at desc);

alter table public.discussion_threads enable row level security;
create policy "threads readable"     on public.discussion_threads for select using (true);
create policy "insert own threads"   on public.discussion_threads for insert with check (auth.uid() = user_id);
create policy "delete own threads"   on public.discussion_threads for delete using (auth.uid() = user_id);
```

### `discussion_posts`

```sql
create table public.discussion_posts (
  id             uuid        not null default gen_random_uuid() primary key,
  thread_id      uuid        not null references public.discussion_threads(id) on delete cascade,
  user_id        uuid        not null references public.profiles(user_id) on delete cascade,
  parent_post_id uuid                 references public.discussion_posts(id) on delete cascade,
  body           text        not null,
  is_deleted     boolean     not null default false,
  created_at     timestamptz not null default now(),
  constraint post_body_len check (char_length(btrim(body)) between 1 and 5000)
);
create index discussion_posts_thread_idx on public.discussion_posts (thread_id, created_at);

alter table public.discussion_posts enable row level security;
create policy "posts readable"   on public.discussion_posts for select using (true);
create policy "insert own posts" on public.discussion_posts for insert with check (auth.uid() = user_id);
-- No delete/update policy: post deletion is soft, done via the RPC below.
```

### Trigger — bump thread activity on new post

```sql
create or replace function public.bump_thread_activity()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.discussion_threads set last_activity_at = now() where id = new.thread_id;
  return new;
end; $$;
create trigger discussion_posts_bump_activity
  after insert on public.discussion_posts
  for each row execute function public.bump_thread_activity();
```

### Read RPCs (SECURITY DEFINER — author header regardless of privacy)

```sql
-- Threads for a media page, newest-active first, with author header + reply count.
create or replace function public.get_media_threads(p_media_id integer, p_limit integer default 100)
returns table (
  id uuid, media_id integer, user_id uuid, title text, created_at timestamptz,
  last_activity_at timestamptz, reply_count bigint,
  username citext, display_name text, avatar_url text
)
language sql stable security definer set search_path = public as $$
  select t.id, t.media_id, t.user_id, t.title, t.created_at, t.last_activity_at,
         (select count(*) from public.discussion_posts p where p.thread_id = t.id) as reply_count,
         pr.username, pr.display_name, pr.avatar_url
  from public.discussion_threads t
  join public.profiles pr on pr.user_id = t.user_id
  where t.media_id = p_media_id
  order by t.last_activity_at desc
  limit p_limit;
$$;

-- All posts in a thread with author headers (flat; the client builds the tree).
create or replace function public.get_thread_posts(p_thread_id uuid)
returns table (
  id uuid, thread_id uuid, user_id uuid, parent_post_id uuid,
  body text, is_deleted boolean, created_at timestamptz,
  username citext, display_name text, avatar_url text
)
language sql stable security definer set search_path = public as $$
  select p.id, p.thread_id, p.user_id, p.parent_post_id,
         case when p.is_deleted then '' else p.body end as body,
         p.is_deleted, p.created_at,
         pr.username, pr.display_name, pr.avatar_url
  from public.discussion_posts p
  join public.profiles pr on pr.user_id = p.user_id
  where p.thread_id = p_thread_id
  order by p.created_at asc;
$$;

-- Single thread + author header (for the thread page).
create or replace function public.get_thread(p_thread_id uuid)
returns table (
  id uuid, media_id integer, user_id uuid, title text, body text,
  created_at timestamptz, last_activity_at timestamptz,
  username citext, display_name text, avatar_url text
)
language sql stable security definer set search_path = public as $$
  select t.id, t.media_id, t.user_id, t.title, t.body, t.created_at, t.last_activity_at,
         pr.username, pr.display_name, pr.avatar_url
  from public.discussion_threads t
  join public.profiles pr on pr.user_id = t.user_id
  where t.id = p_thread_id;
$$;

-- Soft-delete own post (keeps children).
create or replace function public.soft_delete_post(p_post_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.discussion_posts
    set is_deleted = true, body = ''
    where id = p_post_id and user_id = auth.uid();
end; $$;

grant execute on function public.get_media_threads(integer, integer) to anon, authenticated;
grant execute on function public.get_thread(uuid) to anon, authenticated;
grant execute on function public.get_thread_posts(uuid) to anon, authenticated;
grant execute on function public.soft_delete_post(uuid) to authenticated;
```

- The thread page reads its thread via `get_thread(p_thread_id)`. Post bodies for deleted
  posts are returned as `''` by `get_thread_posts`; the UI shows "[deleted]".
- `soft_delete_post` is ownership-checked in the function body (`user_id = auth.uid()`); it
  is granted to `authenticated` only.

## 4. Data access (`src/lib/discussions/*`)

- Types: `DiscussionThread` (id, mediaId, userId, title, createdAt, lastActivityAt,
  replyCount, author {username, displayName, avatarUrl}); `DiscussionPost` (id, threadId,
  userId, parentPostId, body, isDeleted, createdAt, author {…}).
- Over `SupaLike`:
  - `listThreads(supabase, mediaId, limit?)` → `DiscussionThread[]` via `get_media_threads`.
  - `getThread(supabase, threadId)` → `DiscussionThread | null` (single thread + author).
  - `createThread(supabase, userId, mediaId, title, body)` → validate title/body → insert →
    `{ ok, id } | { ok:false, error }`.
  - `getThreadPosts(supabase, threadId)` → `DiscussionPost[]` via `get_thread_posts`.
  - `createPost(supabase, userId, threadId, parentPostId, body)` → validate → insert.
  - `deletePost(supabase, postId)` → `rpc("soft_delete_post")`.
  - `deleteThread(supabase, threadId)` → delete (RLS own-only).
- **`buildPostTree(posts): PostNode[]`** — pure: flat `DiscussionPost[]` → nested tree by
  `parentPostId`, children ordered by `createdAt`, roots = null parent. Defensive against an
  orphaned `parentPostId` (treat as root) and against cycles (guard visited ids).

## 5. UI

- **`src/components/discussions/DiscussionBoard.tsx`** (client) on `/media/[id]` above the
  Comments section: header "Discussions (N)", a "Start a discussion" composer (title + body)
  gated on sign-in (else "Sign in to start a discussion"), and the thread list (title →
  thread page, `@author`, reply count, relative last-activity). Loading/empty/error states.
  Unconfigured Supabase → minimal note, no composer.
- **`src/app/media/[id]/discussions/[threadId]/page.tsx`** (server): loads the media title
  (`getMediaById`) + `loadThread(mediaId, threadId)`; `not_found` (missing, or
  `thread.media_id !== mediaId`) → `notFound()`. Renders a back link
  ("← Discussions for *Title*"), the opening post (title, body, author), then `ThreadView`.
- **`src/components/discussions/ThreadView.tsx`** (client): seeded with initial posts;
  builds the tree via `buildPostTree`; renders recursively with indentation **capped after
  ~5 levels**. Each post: `@username` (→ `/u/username`), body as **plain text**
  (`whitespace-pre-wrap`), relative time, a **Reply** toggle (inline composer →
  `createPost` with that `parentPostId`), **Delete** on own posts (→ `deletePost`,
  soft). "[deleted]" posts show a placeholder and still render children. A top-level reply
  composer posts with `parentPostId = null`. Re-fetch posts after any mutation.
- Reuse existing avatar-fallback idiom (ProfileHeader) and relative-time approach (FeedView).

## 6. Edge cases & error handling

- Validation via DB CHECK + client (title 1–200, bodies 1–5000, trimmed).
- Post delete = soft (keeps children); thread delete = hard cascade (author-only).
- Indent cap after ~5 levels (threading preserved, indentation stops).
- Thread-page `media_id`/URL mismatch → `notFound()`.
- Signed-out → read-only, composers become sign-in prompts. Unconfigured → minimal note /
  loader catches → `notFound()`.
- **XSS:** all titles/bodies rendered as text; never `dangerouslySetInnerHTML`.
- Read failures → error card; mutation failures → inline error, optimistic change reverted.

## 7. Testing

- **Pure:** `buildPostTree` — ordering, multiple roots, orphaned parent, cycle guard.
- **Queries (mocked SupaLike):** create/list/getThread/getThreadPosts/createPost/deletePost
  + validation.
- **Server loader:** `loadThread` — not_found (missing / media mismatch), ok maps posts.
- **Components (mocked):** DiscussionBoard (list/empty/composer-gating), ThreadView (nested
  render, reply composer, delete-own, "[deleted]").
- **RLS + CHECK + RPCs** verified against the live DB (public read; insert/delete own;
  soft-delete only own; empty/oversized rejected).
- Existing 243 tests stay green.

## 8. External setup

None new. Claude applies the discussion migration(s) via the connected Supabase tools.

## 9. Explicitly out of scope (this slice)

- **Slice B: user-created topic communities** (creation, membership, directory) — next slice,
  reuses this slice's thread/post primitive + tree renderer + ThreadView.
- Editing posts/threads; reactions/votes; @-mentions; moderation/reporting; pinning;
  pagination beyond a single limit; realtime; notifications on replies.
