-- supabase/migrations/0013_community_bans_rpc.sql
-- Read RPC backing the manage panel's "Banned members" list. Owner/moderator
-- only: the role check is inside the WHERE, so a non-mod caller simply gets an
-- empty set (community_role_of returns NULL for non-members → NULL IN (...) →
-- row excluded). unban_member (0012) already provides the write path.
create or replace function public.get_community_bans(p_community_id uuid)
returns table (
  user_id uuid, banned_by uuid, created_at timestamptz,
  username citext, display_name text, avatar_url text
)
language sql stable security definer set search_path = public as $$
  select b.user_id, b.banned_by, b.created_at, pr.username, pr.display_name, pr.avatar_url
  from public.community_bans b
  join public.profiles pr on pr.user_id = b.user_id
  where b.community_id = p_community_id
    and public.community_role_of(p_community_id, auth.uid()) in ('owner','moderator')
  order by b.created_at desc;
$$;
revoke all on function public.get_community_bans(uuid) from public, anon, authenticated;
grant execute on function public.get_community_bans(uuid) to authenticated;
