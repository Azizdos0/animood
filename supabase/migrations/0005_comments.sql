-- supabase/migrations/0005_comments.sql
create table if not exists public.comments (
  id         uuid        not null default gen_random_uuid() primary key,
  media_id   integer     not null,
  user_id    uuid        not null references public.profiles(user_id) on delete cascade,
  body       text        not null,
  created_at timestamptz not null default now(),
  constraint body_len check (char_length(btrim(body)) between 1 and 2000)
);

create index if not exists comments_media_id_created_at_idx
  on public.comments (media_id, created_at desc);

alter table public.comments enable row level security;

drop policy if exists "comments readable" on public.comments;
create policy "comments readable" on public.comments
  for select using (true);

drop policy if exists "insert own comments" on public.comments;
create policy "insert own comments" on public.comments
  for insert with check (auth.uid() = user_id);

drop policy if exists "delete own comments" on public.comments;
create policy "delete own comments" on public.comments
  for delete using (auth.uid() = user_id);
