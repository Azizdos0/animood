-- Discovery preferences sync (design: docs/superpowers/specs/2026-09-28-animood-discovery-preferences-sync-design.md).
-- One row per user, whole-document last-write-wins. Clients read their own row
-- directly; all writes go through save_discovery_preferences, which refuses
-- versions older than the stored one.

create table if not exists public.discovery_preferences (
  user_id           uuid        primary key references auth.users(id) on delete cascade,
  seeds             jsonb       not null default '[]'
                    check (jsonb_typeof(seeds) = 'array' and jsonb_array_length(seeds) <= 3),
  hidden_ids        integer[]   not null default '{}'
                    check (cardinality(hidden_ids) <= 5000),
  diversity         real        not null default 0.3
                    check (diversity between 0 and 1),
  excluded_genres   text[]      not null default '{}'
                    check (cardinality(excluded_genres) <= 30),
  client_updated_at timestamptz not null,
  updated_at        timestamptz not null default now()
);

alter table public.discovery_preferences enable row level security;

drop policy if exists "read own preferences" on public.discovery_preferences;
create policy "read own preferences" on public.discovery_preferences
  for select using (auth.uid() = user_id);
-- No insert/update/delete policies: writes go through the RPC below only.

create or replace function public.save_discovery_preferences(
  p_seeds jsonb,
  p_hidden_ids integer[],
  p_diversity real,
  p_excluded_genres text[],
  p_client_updated_at timestamptz
) returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  -- A skewed client clock must not pin its version as newest indefinitely.
  v_version timestamptz := least(p_client_updated_at, now() + interval '5 minutes');
  v_stored timestamptz;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if p_client_updated_at is null then
    raise exception 'client_updated_at is required' using errcode = '22004';
  end if;

  insert into public.discovery_preferences as d
    (user_id, seeds, hidden_ids, diversity, excluded_genres, client_updated_at, updated_at)
  values
    (v_uid, coalesce(p_seeds, '[]'::jsonb), coalesce(p_hidden_ids, '{}'),
     coalesce(p_diversity, 0.3), coalesce(p_excluded_genres, '{}'), v_version, now())
  on conflict (user_id) do update
    set seeds = excluded.seeds,
        hidden_ids = excluded.hidden_ids,
        diversity = excluded.diversity,
        excluded_genres = excluded.excluded_genres,
        client_updated_at = excluded.client_updated_at,
        updated_at = now()
    where excluded.client_updated_at > d.client_updated_at;

  -- Report the stored version either way so a stale client knows to re-pull.
  select client_updated_at into v_stored
    from public.discovery_preferences where user_id = v_uid;
  return v_stored;
end;
$$;

-- Postgres grants PUBLIC execute on new functions (see 0011a); restrict it.
revoke all on function public.save_discovery_preferences(jsonb, integer[], real, text[], timestamptz)
  from public, anon, authenticated;
grant execute on function public.save_discovery_preferences(jsonb, integer[], real, text[], timestamptz)
  to authenticated;

grant select on public.discovery_preferences to authenticated;
