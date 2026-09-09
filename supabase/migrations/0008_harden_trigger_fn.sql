-- supabase/migrations/0008_harden_trigger_fn.sql
-- bump_thread_activity() is a trigger-internal function and must not be exposed as a
-- REST RPC. Supabase's default privileges grant EXECUTE to anon/authenticated on new
-- public functions, so revoke from those roles explicitly (plus PUBLIC). The trigger
-- still fires — trigger functions run in the trigger context regardless of role grants.
revoke all on function public.bump_thread_activity() from public, anon, authenticated;
