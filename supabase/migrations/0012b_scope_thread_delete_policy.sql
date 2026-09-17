-- supabase/migrations/0012b_scope_thread_delete_policy.sql
-- Confine direct thread deletes to MEDIA threads; community thread removal goes
-- through moderate_delete_thread (owner/mod) per the Slice B moderation model.
drop policy if exists "delete own threads" on public.discussion_threads;
create policy "delete own threads" on public.discussion_threads
  for delete using (auth.uid() = user_id and community_id is null);
