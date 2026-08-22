-- supabase/migrations/0006_media_comments_rpc.sql
-- Returns a media page's comments WITH each author's header fields, bypassing the
-- profiles RLS (SECURITY DEFINER) so a comment stays visible and attributable even
-- when its author's profile is private. Returns ONLY comment fields + author
-- username/display_name/avatar_url — never list data or the author's is_public flag.
create or replace function public.get_media_comments(p_media_id integer, p_limit integer default 100)
returns table (
  id           uuid,
  media_id     integer,
  user_id      uuid,
  body         text,
  created_at   timestamptz,
  username     citext,
  display_name text,
  avatar_url   text
)
language sql
stable
security definer
set search_path = public
as $$
  select c.id, c.media_id, c.user_id, c.body, c.created_at,
         p.username, p.display_name, p.avatar_url
  from public.comments c
  join public.profiles p on p.user_id = c.user_id
  where c.media_id = p_media_id
  order by c.created_at desc
  limit p_limit;
$$;

revoke all on function public.get_media_comments(integer, integer) from public;
grant execute on function public.get_media_comments(integer, integer) to anon, authenticated;
