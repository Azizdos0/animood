-- supabase/migrations/0010_media_cache.sql
-- Catalog cache for the Jikan/MAL migration: mapped Media rows keyed by (mal_id, type).
-- Public read; writes only via the service-role RPC below (clients must not forge catalog).
create table if not exists public.media_cache (
  mal_id     integer     not null,
  type       text        not null default 'anime' check (type in ('anime','manga')),
  media      jsonb       not null,
  fetched_at timestamptz not null default now(),
  primary key (mal_id, type)
);
alter table public.media_cache enable row level security;
drop policy if exists "media_cache readable" on public.media_cache;
create policy "media_cache readable" on public.media_cache for select using (true);

create or replace function public.upsert_media_cache(p_rows jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.media_cache (mal_id, type, media, fetched_at)
  select (r->>'mal_id')::int, coalesce(r->>'type','anime'), r->'media', now()
  from jsonb_array_elements(p_rows) as r
  on conflict (mal_id, type) do update
    set media = excluded.media, fetched_at = excluded.fetched_at;
end; $$;
revoke all on function public.upsert_media_cache(jsonb) from public, anon, authenticated;
grant execute on function public.upsert_media_cache(jsonb) to service_role;
