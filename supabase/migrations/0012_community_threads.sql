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
-- Return type (OUT params) changed, so create-or-replace cannot be used; drop first.
drop function if exists public.get_thread(uuid);
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
  if v_role is null or v_role not in ('owner','moderator') then raise exception 'forbidden'; end if;
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
  if v_role is null or v_role not in ('owner','moderator') then raise exception 'forbidden'; end if;
  update public.discussion_posts set is_deleted = true, body = '' where id = p_post_id;
end; $$;

create or replace function public.moderate_delete_thread(p_thread_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_comm uuid; v_role text;
begin
  select community_id into v_comm from public.discussion_threads where id = p_thread_id;
  if v_comm is null then raise exception 'not_community_thread'; end if;
  v_role := public.community_role_of(v_comm, v_uid);
  if v_role is null or v_role not in ('owner','moderator') then raise exception 'forbidden'; end if;
  delete from public.discussion_threads where id = p_thread_id;
end; $$;

-- Ban: mods cannot ban the owner or another moderator; only the owner can.
create or replace function public.ban_member(p_community_id uuid, p_target uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_role text; v_target_role text;
begin
  v_role := public.community_role_of(p_community_id, v_uid);
  if v_role is null or v_role not in ('owner','moderator') then raise exception 'forbidden'; end if;
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
  if v_role is null or v_role not in ('owner','moderator') then raise exception 'forbidden'; end if;
  delete from public.community_bans where community_id = p_community_id and user_id = p_target;
end; $$;

-- Reads: revoke default PUBLIC execute, then grant to anon + authenticated.
revoke all on function public.get_community_threads(uuid,integer) from public;
revoke all on function public.get_community_members(uuid) from public;
grant execute on function public.get_community_threads(uuid,integer) to anon, authenticated;
grant execute on function public.get_community_members(uuid) to anon, authenticated;
-- Writes: revoke default PUBLIC/anon execute (0008 lesson), then grant to authenticated only.
revoke all on function public.create_community_thread(uuid,text,text) from public, anon, authenticated;
revoke all on function public.create_community_post(uuid,uuid,text) from public, anon, authenticated;
revoke all on function public.set_thread_pinned(uuid,boolean) from public, anon, authenticated;
revoke all on function public.moderate_remove_post(uuid) from public, anon, authenticated;
revoke all on function public.moderate_delete_thread(uuid) from public, anon, authenticated;
revoke all on function public.ban_member(uuid,uuid) from public, anon, authenticated;
revoke all on function public.unban_member(uuid,uuid) from public, anon, authenticated;
grant execute on function public.create_community_thread(uuid,text,text) to authenticated;
grant execute on function public.create_community_post(uuid,uuid,text) to authenticated;
grant execute on function public.set_thread_pinned(uuid,boolean) to authenticated;
grant execute on function public.moderate_remove_post(uuid) to authenticated;
grant execute on function public.moderate_delete_thread(uuid) to authenticated;
grant execute on function public.ban_member(uuid,uuid) to authenticated;
grant execute on function public.unban_member(uuid,uuid) to authenticated;
