-- supabase/migrations/0007_discussions.sql
-- Per-anime threaded discussion boards (Communities Slice A).

create table if not exists public.discussion_threads (
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
create index if not exists discussion_threads_media_activity_idx
  on public.discussion_threads (media_id, last_activity_at desc);

alter table public.discussion_threads enable row level security;
drop policy if exists "threads readable"   on public.discussion_threads;
create policy "threads readable"   on public.discussion_threads for select using (true);
drop policy if exists "insert own threads" on public.discussion_threads;
create policy "insert own threads" on public.discussion_threads for insert with check (auth.uid() = user_id);
drop policy if exists "delete own threads" on public.discussion_threads;
create policy "delete own threads" on public.discussion_threads for delete using (auth.uid() = user_id);

create table if not exists public.discussion_posts (
  id             uuid        not null default gen_random_uuid() primary key,
  thread_id      uuid        not null references public.discussion_threads(id) on delete cascade,
  user_id        uuid        not null references public.profiles(user_id) on delete cascade,
  parent_post_id uuid                 references public.discussion_posts(id) on delete cascade,
  body           text        not null,
  is_deleted     boolean     not null default false,
  created_at     timestamptz not null default now(),
  constraint post_body_len check (char_length(btrim(body)) between 1 and 5000)
);
create index if not exists discussion_posts_thread_idx on public.discussion_posts (thread_id, created_at);

alter table public.discussion_posts enable row level security;
drop policy if exists "posts readable"   on public.discussion_posts;
create policy "posts readable"   on public.discussion_posts for select using (true);
drop policy if exists "insert own posts" on public.discussion_posts;
create policy "insert own posts" on public.discussion_posts for insert with check (auth.uid() = user_id);
-- No delete/update policy: post deletion is soft, via soft_delete_post() below.

-- Bump the parent thread's activity when a post is added (for board sorting).
create or replace function public.bump_thread_activity()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.discussion_threads set last_activity_at = now() where id = new.thread_id;
  return new;
end; $$;
drop trigger if exists discussion_posts_bump_activity on public.discussion_posts;
create trigger discussion_posts_bump_activity
  after insert on public.discussion_posts
  for each row execute function public.bump_thread_activity();

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

-- Soft-delete own post (keeps children visible).
create or replace function public.soft_delete_post(p_post_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.discussion_posts
    set is_deleted = true, body = ''
    where id = p_post_id and user_id = auth.uid();
end; $$;

revoke all on function public.get_media_threads(integer, integer) from public;
revoke all on function public.get_thread(uuid) from public;
revoke all on function public.get_thread_posts(uuid) from public;
revoke all on function public.soft_delete_post(uuid) from public;
grant execute on function public.get_media_threads(integer, integer) to anon, authenticated;
grant execute on function public.get_thread(uuid) to anon, authenticated;
grant execute on function public.get_thread_posts(uuid) to anon, authenticated;
grant execute on function public.soft_delete_post(uuid) to authenticated;
