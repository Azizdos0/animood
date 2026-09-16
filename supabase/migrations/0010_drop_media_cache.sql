-- supabase/migrations/0010_drop_media_cache.sql
-- Remove the media_cache table + RPC from the reverted Jikan/MAL migration.
-- The catalog is back on AniList (batched + fast), so this cache is unused
-- (0 rows, no code references). Idempotent.
drop function if exists public.upsert_media_cache(jsonb);
drop table if exists public.media_cache;
