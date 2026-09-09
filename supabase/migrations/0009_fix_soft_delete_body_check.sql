-- supabase/migrations/0009_fix_soft_delete_body_check.sql
-- Fix: soft_delete_post() sets body = '' (required — discussion_posts is publicly
-- readable, so a deleted post's text must not remain in the row), but the original
-- post_body_len CHECK forbade an empty body, so deletion always raised check_violation.
-- Allow an empty body when the post is deleted.
alter table public.discussion_posts drop constraint post_body_len;
alter table public.discussion_posts
  add constraint post_body_len
  check (is_deleted or char_length(btrim(body)) between 1 and 5000);
