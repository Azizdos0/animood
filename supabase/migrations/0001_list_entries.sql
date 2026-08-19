create table if not exists public.list_entries (
  user_id    uuid        not null references auth.users(id) on delete cascade,
  media_id   integer     not null,
  status     text        not null,
  score      integer,
  progress   integer     not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, media_id)
);

alter table public.list_entries enable row level security;

drop policy if exists "own rows" on public.list_entries;
create policy "own rows" on public.list_entries
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
