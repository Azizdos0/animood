-- supabase/migrations/0004_follows.sql
create table if not exists public.follows (
  follower_id  uuid        not null references auth.users(id) on delete cascade,
  following_id uuid        not null references auth.users(id) on delete cascade,
  created_at   timestamptz not null default now(),
  primary key (follower_id, following_id),
  constraint no_self_follow check (follower_id <> following_id)
);

alter table public.follows enable row level security;

drop policy if exists "follows readable" on public.follows;
create policy "follows readable" on public.follows
  for select using (true);

drop policy if exists "insert own follows" on public.follows;
create policy "insert own follows" on public.follows
  for insert with check (auth.uid() = follower_id);

drop policy if exists "delete own follows" on public.follows;
create policy "delete own follows" on public.follows
  for delete using (auth.uid() = follower_id);

create or replace function public.get_follow_counts(p_user_id uuid)
returns table (followers integer, following integer)
language sql
stable
security invoker
set search_path = public
as $$
  select
    (select count(*) from public.follows f where f.following_id = p_user_id)::int,
    (select count(*) from public.follows f where f.follower_id  = p_user_id)::int;
$$;

revoke all on function public.get_follow_counts(uuid) from public;
grant execute on function public.get_follow_counts(uuid) to anon, authenticated;
