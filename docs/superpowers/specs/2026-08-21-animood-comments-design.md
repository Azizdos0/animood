# Animood — Anime/Manga Comments Design Spec

**Date:** 2026-08-21
**Status:** Approved (owner delegated design), ready for implementation planning
**Scope:** A public comment section on media (anime/manga) detail pages (Phase 3, third slice)

## 1. Vision

Let users talk about a title, right on its page. Each `/media/[id]` page gets a comment
section: signed-in users post, everyone reads. This is the first *discussion* surface in
Animood and a stepping stone toward communities (deferred, ~2 weeks out).

Built on the existing accounts + profiles stack (`profiles`, RLS, the `/welcome` username
flow), mirroring the patterns from the follow/feed slice.

## 2. Decisions (owner-delegated)

- **Flat comments, no threaded replies** in v1. Replies are a deferred fast-follow.
- **Posting requires sign-in** (a signed-in user already has a username via `/welcome`).
  **Reading is public** — anyone, logged-out included, can read comments.
- **Authors can delete their own** comment. **Editing is deferred.**
- **Newest-first**; body length **1–2000 chars**, non-empty (trimmed). Comment **count**
  shown on the section header.
- No moderation, reporting, or spoiler tags in v1 (deferred to the communities phase).

## 3. Data model (Supabase)

### New `comments` table

```sql
create table public.comments (
  id         uuid        not null default gen_random_uuid() primary key,
  media_id   integer     not null,
  user_id    uuid        not null references public.profiles(user_id) on delete cascade,
  body       text        not null,
  created_at timestamptz not null default now(),
  constraint body_len check (char_length(btrim(body)) between 1 and 2000)
);

create index comments_media_id_created_at_idx on public.comments (media_id, created_at desc);

alter table public.comments enable row level security;

-- Anyone (incl. logged-out) may read comments.
create policy "comments readable" on public.comments
  for select using (true);

-- A user may create only their own comment (and must have a profile — enforced by the FK).
create policy "insert own comments" on public.comments
  for insert with check (auth.uid() = user_id);

-- A user may delete only their own comment.
create policy "delete own comments" on public.comments
  for delete using (auth.uid() = user_id);
```

- **FK to `profiles(user_id)`** (not `auth.users`) so a commenter is guaranteed to have a
  username, and so the display query can embed the author's profile via the FK
  relationship. `on delete cascade` cleans up if the profile/account is removed.
- The `body_len` CHECK enforces 1–2000 chars after trimming — the app also validates.
- Index on `(media_id, created_at desc)` keeps the per-page newest-first read fast.
- No UPDATE policy (editing deferred). Read is fully public; writes are own-row only.

## 4. Data access (`src/lib/comments/*`)

- `interface CommentItem { id: string; mediaId: number; userId: string; username: string; displayName: string | null; avatarUrl: string | null; body: string; createdAt: string }`
- Over `SupaLike` (from `@/lib/sync/cloud`):
  - `listComments(supabase, mediaId, limit = 100): Promise<CommentItem[]>` — selects
    comments for `media_id`, newest first, embedding the author's `profiles`
    (`select("id, media_id, user_id, body, created_at, profiles(username, display_name, avatar_url)")`),
    maps to `CommentItem` (dropping any row whose embedded profile is missing).
  - `addComment(supabase, userId, mediaId, body): Promise<{ ok: true } | { ok: false; error: "empty" | "too_long" | "unknown" }>`
    — trims + validates length client-side before insert; maps insert failure to `unknown`.
  - `deleteComment(supabase, id): Promise<void>` — deletes by id (RLS restricts to own row).

## 5. UI

- **`src/components/comments/CommentSection.tsx`** (client), `CommentSection({ mediaId }: { mediaId: number })`:
  - On mount, `listComments` for the media id (via `supabaseBrowser()` when configured;
    when Supabase is unconfigured, render a minimal "comments unavailable" note and no
    composer — never crash).
  - **Header:** "Comments (N)".
  - **Composer:** shown only when signed in (viewer resolved via
    `supabaseBrowser().auth.getUser()`); a textarea + "Post" button, disabled while empty
    or pending, with inline validation errors ("Comment can't be empty." /
    "Keep it under 2000 characters."). On success, prepend the new comment optimistically
    (or re-fetch) and clear the box. When signed-out, show a "Sign in to comment" prompt
    instead of the composer.
  - **List:** each row = avatar (img or gradient-initial fallback, matching ProfileHeader/
    FeedView), `@username` link → `/u/username`, relative time, body (whitespace-preserved,
    plain text — never rendered as HTML), and a small "Delete" control shown only on the
    viewer's own comments (confirms, then `deleteComment` + removes the row).
  - **States:** loading skeleton, empty ("No comments yet. Be the first."), error card.
- **Wire into `src/app/media/[id]/page.tsx`:** add a full-width `<CommentSection mediaId={media.id} />`
  section below the detail grid, inside the standard container width.

**XSS note:** comment `body` is untrusted user input and MUST be rendered as text (React's
default escaping), never via `dangerouslySetInnerHTML`.

## 6. Testing

Project pattern (pure-core + Vitest via `npm test` with the required NODE_OPTIONS):

- **Unit (mocked SupaLike):** `comments/queries` — `listComments` maps embedded profile →
  CommentItem and drops profile-less rows; `addComment` rejects empty/too-long BEFORE
  insert and maps success/failure; `deleteComment` issues the delete.
- **Component (mocked supabase/fetch):** `CommentSection` — renders a list; shows the
  composer only when signed in and the sign-in prompt when not; posting validation errors;
  the Delete control appears only on the viewer's own comments.
- **RLS + CHECK:** the new `comments` policies + `body_len` CHECK verified against the live
  DB via the Supabase tools (public read; insert/delete own only; empty/oversized body
  rejected).
- Existing 217 tests stay green.

## 7. External setup

None new — Supabase project, env vars, and Google OAuth are already live. Claude applies
the `comments` migration via the connected Supabase tools.

## 8. Explicitly out of scope (this spec)

- Threaded replies; editing comments; likes/reactions; @-mentions.
- Moderation, reporting, spoiler tags, rate limiting.
- Realtime updates / pagination beyond a single limit.
- Comments on anything other than media detail pages.
- **Communities** — a separate, later slice (see the deferred communities note).
