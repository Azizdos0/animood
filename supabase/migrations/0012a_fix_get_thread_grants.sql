-- get_thread was dropped+recreated in 0012 (row-type change), losing its explicit
-- grants. Restore the 0007 convention: revoke default PUBLIC, grant to anon+authenticated.
revoke all on function public.get_thread(uuid) from public;
grant execute on function public.get_thread(uuid) to anon, authenticated;
