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
