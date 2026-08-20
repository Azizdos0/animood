-- supabase/migrations/0003_profile_card_rpc.sql
-- Existence/header lookup for a profile by username that BYPASSES the profiles
-- RLS SELECT policies (SECURITY DEFINER) so a private profile can be resolved
-- to render the "This profile is private" card. Returns ONLY header fields —
-- never list_entries — so a private user's tracked list is never exposed.
create or replace function public.get_profile_card(p_username citext)
returns table (
  user_id      uuid,
  username     citext,
  display_name text,
  avatar_url   text,
  is_public    boolean,
  created_at   timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select user_id, username, display_name, avatar_url, is_public, created_at
  from public.profiles
  where username = p_username;
$$;

revoke all on function public.get_profile_card(citext) from public;
grant execute on function public.get_profile_card(citext) to anon, authenticated;
