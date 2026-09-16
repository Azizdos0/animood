-- supabase/migrations/0011a_fix_community_authz.sql
-- Fix: NULL fail-open in owner checks (community_role_of returns NULL for
-- non-members, and `NULL <> 'owner'` evaluates to NULL, which an `if` treats
-- as false, silently skipping the guard) + missing revoke-from-public on the
-- community write RPCs (Postgres grants PUBLIC execute by default on
-- function creation, so anon retained EXECUTE despite the `grant ... to
-- authenticated` in 0011).

create or replace function public.set_member_role(p_community_id uuid, p_target uuid, p_role text)
returns void language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid();
begin
  if public.community_role_of(p_community_id, v_uid) is distinct from 'owner' then raise exception 'forbidden'; end if;
  if p_role not in ('moderator','member') then raise exception 'bad_role'; end if;
  if public.community_role_of(p_community_id, p_target) = 'owner' then raise exception 'cannot_target_owner'; end if;
  update public.community_members set role = p_role
    where community_id = p_community_id and user_id = p_target;
end; $$;

create or replace function public.delete_community(p_community_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid();
begin
  if public.community_role_of(p_community_id, v_uid) is distinct from 'owner' then raise exception 'forbidden'; end if;
  delete from public.communities where id = p_community_id;
end; $$;

revoke all on function public.create_community(citext,text,text) from public, anon, authenticated;
revoke all on function public.join_community(uuid) from public, anon, authenticated;
revoke all on function public.leave_community(uuid) from public, anon, authenticated;
revoke all on function public.set_member_role(uuid,uuid,text) from public, anon, authenticated;
revoke all on function public.delete_community(uuid) from public, anon, authenticated;

grant execute on function public.create_community(citext,text,text) to authenticated;
grant execute on function public.join_community(uuid) to authenticated;
grant execute on function public.leave_community(uuid) to authenticated;
grant execute on function public.set_member_role(uuid,uuid,text) to authenticated;
grant execute on function public.delete_community(uuid) to authenticated;
