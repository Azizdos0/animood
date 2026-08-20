-- supabase/migrations/0002_profiles.sql
create extension if not exists citext;

create table if not exists public.profiles (
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

drop policy if exists "public profiles readable" on public.profiles;
create policy "public profiles readable" on public.profiles
  for select using (is_public = true);

drop policy if exists "own profile readable" on public.profiles;
create policy "own profile readable" on public.profiles
  for select using (auth.uid() = user_id);

drop policy if exists "own profile writable" on public.profiles;
create policy "own profile writable" on public.profiles
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

alter table public.list_entries
  add column if not exists is_favorite boolean not null default false;

drop policy if exists "public list readable" on public.list_entries;
create policy "public list readable" on public.list_entries
  for select using (
    exists (
      select 1 from public.profiles p
      where p.user_id = list_entries.user_id and p.is_public = true
    )
  );
