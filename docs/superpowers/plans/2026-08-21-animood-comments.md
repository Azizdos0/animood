# Anime/Manga Comments Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a public, flat comment section to every `/media/[id]` page — signed-in users post and delete their own; everyone reads.

**Architecture:** A new `comments` table (public-read, insert/delete-own via RLS, FK to `profiles(user_id)` so authors always have a username and the author profile can be embedded in the read). Data access in `src/lib/comments/*`; a client `CommentSection` component wired into the media detail page. Mirrors the follow/feed slice patterns.

**Tech Stack:** Next.js 16 (App Router, RSC), TypeScript, Tailwind v4, Supabase (Postgres + RLS, `@supabase/ssr`), Vitest + Testing Library.

## Global Constraints

- **Node >= 22.4.** Run the full suite via `npm test` (sets `NODE_OPTIONS=--no-experimental-webstorage`, required on Node 25). **Never** run the full suite with bare `npx vitest run`. Single files may use `npx vitest run <path>`.
- **No new runtime dependencies.**
- **Reads/writes via the anon key under RLS only — no service-role key.**
- **The signed-out / Supabase-unconfigured path must keep working** — the media page must still render; the comment section degrades to a minimal note when unconfigured and a "sign in to comment" prompt when signed-out.
- **XSS: comment `body` is untrusted — render as text only (React default escaping). NEVER `dangerouslySetInnerHTML`.**
- **Icons:** inline SVG set in `src/components/icons.tsx` only.
- **Page shell / container:** the media page uses `mx-auto max-w-[1560px] ... px-6 sm:px-10`; the comment section sits in that width.
- **SupaLike** (`src/lib/sync/cloud.ts`) is the shared structural Supabase type — reuse it.
- **Existing 217 tests must stay green.** `npm run build` exit 0. `npx tsc --noEmit` clean.
- **Commit after every task.**

---

### Task 1: Database migration — `comments` table + RLS + CHECK + index

**Files:**
- Create: `supabase/migrations/0005_comments.sql`
- Apply to project ref `teerejvdaohbtlrxxcdo` via the Supabase `apply_migration` tool.

**Interfaces:**
- Produces (DB): table `public.comments(id uuid pk, media_id int, user_id uuid → profiles(user_id), body text, created_at)`; `body_len` CHECK (1–2000 trimmed); index `(media_id, created_at desc)`; RLS (public SELECT, insert/delete own).

- [ ] **Step 1: Write the migration file**

```sql
-- supabase/migrations/0005_comments.sql
create table if not exists public.comments (
  id         uuid        not null default gen_random_uuid() primary key,
  media_id   integer     not null,
  user_id    uuid        not null references public.profiles(user_id) on delete cascade,
  body       text        not null,
  created_at timestamptz not null default now(),
  constraint body_len check (char_length(btrim(body)) between 1 and 2000)
);

create index if not exists comments_media_id_created_at_idx
  on public.comments (media_id, created_at desc);

alter table public.comments enable row level security;

drop policy if exists "comments readable" on public.comments;
create policy "comments readable" on public.comments
  for select using (true);

drop policy if exists "insert own comments" on public.comments;
create policy "insert own comments" on public.comments
  for insert with check (auth.uid() = user_id);

drop policy if exists "delete own comments" on public.comments;
create policy "delete own comments" on public.comments
  for delete using (auth.uid() = user_id);
```

- [ ] **Step 2: Apply the migration** via the Supabase `apply_migration` tool (name `0005_comments`, project_id `teerejvdaohbtlrxxcdo`).

- [ ] **Step 3: Verify** with `list_tables` (verbose) — confirm `public.comments` with the columns, PK, the FK to `public.profiles(user_id)`, and RLS enabled. Run `execute_sql` to confirm the CHECK rejects an empty/whitespace body and one over 2000 chars (wrap each in a `do $$ ... exception when check_violation ...` block, or attempt inserts expecting failure — note RLS is bypassed by the service-role MCP connection but the CHECK still applies; a bare insert also needs a valid `user_id` that exists in profiles, e.g. the existing `reiatsu` user — or test the CHECK by casting: `select char_length(btrim('   '))` is a weaker check, so prefer an actual insert of a real profile user_id with a whitespace body and expect check_violation). Run `get_advisors` (security) — no new "RLS disabled"/"policy allows all" ERROR (pre-existing WARNs expected).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0005_comments.sql
git commit -m "feat(db): comments table + RLS + body CHECK + media index"
```

---

### Task 2: Comment data-access queries (mocked Supabase)

**Files:**
- Create: `src/lib/comments/types.ts`
- Create: `src/lib/comments/queries.ts`
- Test: `src/lib/comments/__tests__/queries.test.ts`

**Interfaces:**
- Consumes: `SupaLike` from `@/lib/sync/cloud`.
- Produces:
  - `interface CommentItem { id: string; mediaId: number; userId: string; username: string; displayName: string | null; avatarUrl: string | null; body: string; createdAt: string }`
  - `listComments(supabase: SupaLike, mediaId: number, limit?: number): Promise<CommentItem[]>` — default limit 100. Selects `id, media_id, user_id, body, created_at, profiles(username, display_name, avatar_url)` for `media_id`, `order created_at desc`, `limit`. Maps each row → `CommentItem`, dropping any row whose embedded `profiles` is missing/null.
  - `addComment(supabase: SupaLike, userId: string, mediaId: number, body: string): Promise<{ ok: true } | { ok: false; error: "empty" | "too_long" | "unknown" }>` — trims; empty → `empty`; length > 2000 → `too_long`; else inserts `{ user_id, media_id, body: trimmed }`; insert error → `unknown`.
  - `deleteComment(supabase: SupaLike, id: string): Promise<void>` — deletes by id; error throws.

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/comments/__tests__/queries.test.ts
import { describe, it, expect, vi } from "vitest";
import { listComments, addComment, deleteComment } from "@/lib/comments/queries";

describe("listComments", () => {
  it("maps rows with embedded profile and drops profile-less rows", async () => {
    const rows = [
      { id: "c1", media_id: 5, user_id: "u1", body: "hi", created_at: "2026-02-01T00:00:00Z",
        profiles: { username: "friend", display_name: "Friend", avatar_url: null } },
      { id: "c2", media_id: 5, user_id: "u2", body: "orphan", created_at: "2026-01-01T00:00:00Z", profiles: null },
    ];
    const q: Record<string, unknown> = {
      select: () => q, eq: () => q, order: () => q,
      limit: async () => ({ data: rows, error: null }),
    };
    const supabase = { from: () => q } as never;
    const items = await listComments(supabase, 5);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ id: "c1", mediaId: 5, username: "friend", body: "hi" });
  });
});

describe("addComment", () => {
  const noInsert = { from: () => ({ insert: vi.fn() }) } as never;
  it("rejects an empty/whitespace body before inserting", async () => {
    expect(await addComment(noInsert, "u1", 5, "   ")).toEqual({ ok: false, error: "empty" });
  });
  it("rejects an over-long body before inserting", async () => {
    expect(await addComment(noInsert, "u1", 5, "x".repeat(2001))).toEqual({ ok: false, error: "too_long" });
  });
  it("inserts a trimmed body and returns ok", async () => {
    const insert = vi.fn(async () => ({ error: null }));
    const supabase = { from: () => ({ insert }) } as never;
    expect(await addComment(supabase, "u1", 5, "  hello  ")).toEqual({ ok: true });
    expect(insert).toHaveBeenCalledWith({ user_id: "u1", media_id: 5, body: "hello" });
  });
  it("maps an insert failure to unknown", async () => {
    const supabase = { from: () => ({ insert: async () => ({ error: { message: "x" } }) }) } as never;
    expect(await addComment(supabase, "u1", 5, "hello")).toEqual({ ok: false, error: "unknown" });
  });
});

describe("deleteComment", () => {
  it("deletes by id", async () => {
    const eq = vi.fn(async () => ({ error: null }));
    const supabase = { from: () => ({ delete: () => ({ eq }) }) } as never;
    await expect(deleteComment(supabase, "c1")).resolves.toBeUndefined();
    expect(eq).toHaveBeenCalledWith("id", "c1");
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/lib/comments/__tests__/queries.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Write the implementation**

```typescript
// src/lib/comments/types.ts
export interface CommentItem {
  id: string;
  mediaId: number;
  userId: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  body: string;
  createdAt: string;
}
```

```typescript
// src/lib/comments/queries.ts
import type { SupaLike } from "@/lib/sync/cloud";
import type { CommentItem } from "./types";

const TABLE = "comments";
const MAX = 2000;

interface Row {
  id: string; media_id: number; user_id: string; body: string; created_at: string;
  profiles: { username: string; display_name: string | null; avatar_url: string | null } | null;
}

export async function listComments(supabase: SupaLike, mediaId: number, limit = 100): Promise<CommentItem[]> {
  const { data, error } = await supabase.from(TABLE)
    .select("id, media_id, user_id, body, created_at, profiles(username, display_name, avatar_url)")
    .eq("media_id", mediaId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  const rows = (data ?? []) as Row[];
  const items: CommentItem[] = [];
  for (const r of rows) {
    if (!r.profiles) continue;
    items.push({
      id: r.id, mediaId: r.media_id, userId: r.user_id,
      username: r.profiles.username, displayName: r.profiles.display_name, avatarUrl: r.profiles.avatar_url,
      body: r.body, createdAt: r.created_at,
    });
  }
  return items;
}

export async function addComment(
  supabase: SupaLike, userId: string, mediaId: number, body: string
): Promise<{ ok: true } | { ok: false; error: "empty" | "too_long" | "unknown" }> {
  const trimmed = body.trim();
  if (trimmed.length === 0) return { ok: false, error: "empty" };
  if (trimmed.length > MAX) return { ok: false, error: "too_long" };
  const { error } = await supabase.from(TABLE).insert({ user_id: userId, media_id: mediaId, body: trimmed });
  if (error) return { ok: false, error: "unknown" };
  return { ok: true };
}

export async function deleteComment(supabase: SupaLike, id: string): Promise<void> {
  const { error } = await supabase.from(TABLE).delete().eq("id", id);
  if (error) throw error;
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/lib/comments/__tests__/queries.test.ts`
Expected: PASS. Then `npm test` (full suite green).

- [ ] **Step 5: Commit**

```bash
git add src/lib/comments/
git commit -m "feat(comments): CommentItem type + list/add/delete queries"
```

---

### Task 3: CommentSection component + media page wiring

**Files:**
- Create: `src/components/comments/CommentSection.tsx` (client)
- Modify: `src/app/media/[id]/page.tsx` (render the section below the detail grid)
- Test: `src/components/comments/__tests__/CommentSection.test.tsx`

**Interfaces:**
- Consumes: `listComments`/`addComment`/`deleteComment` + `CommentItem` (Task 2); `supabaseBrowser` + `isSupabaseConfigured` (`@/lib/supabase/client`).
- Produces: `CommentSection({ mediaId }: { mediaId: number })`.

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/comments/__tests__/CommentSection.test.tsx
import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

const listComments = vi.fn();
const addComment = vi.fn(async () => ({ ok: true }));
const deleteComment = vi.fn(async () => {});
vi.mock("@/lib/comments/queries", () => ({
  listComments: (...a: unknown[]) => listComments(...a),
  addComment: (...a: unknown[]) => addComment(...a),
  deleteComment: (...a: unknown[]) => deleteComment(...a),
}));
let currentUser: { id: string } | null = null;
vi.mock("@/lib/supabase/client", () => ({
  isSupabaseConfigured: () => true,
  supabaseBrowser: () => ({ auth: { getUser: async () => ({ data: { user: currentUser } }) } }),
}));

import { CommentSection } from "@/components/comments/CommentSection";

const comment = {
  id: "c1", mediaId: 5, userId: "u1", username: "friend", displayName: "Friend",
  avatarUrl: null, body: "great show", createdAt: "2026-02-01T00:00:00Z",
};

beforeEach(() => { listComments.mockResolvedValue([comment]); currentUser = null; });

describe("CommentSection", () => {
  it("renders fetched comments", async () => {
    render(<CommentSection mediaId={5} />);
    expect(await screen.findByText("great show")).toBeInTheDocument();
    expect(screen.getByText(/@friend/)).toBeInTheDocument();
  });
  it("shows a sign-in prompt (no composer) when signed out", async () => {
    render(<CommentSection mediaId={5} />);
    await screen.findByText("great show");
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.getByText(/sign in to comment/i)).toBeInTheDocument();
  });
  it("shows the composer when signed in", async () => {
    currentUser = { id: "viewer" };
    render(<CommentSection mediaId={5} />);
    await waitFor(() => expect(screen.getByRole("textbox")).toBeInTheDocument());
  });
  it("shows a Delete control only on the viewer's own comment", async () => {
    currentUser = { id: "u1" }; // same as comment.userId
    render(<CommentSection mediaId={5} />);
    await screen.findByText("great show");
    expect(screen.getByRole("button", { name: /delete/i })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/components/comments/__tests__/CommentSection.test.tsx`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

`CommentSection.tsx` (client, `"use client"`):
- State: `items: CommentItem[]`, `status: "loading"|"ready"|"error"`, `viewerId: string|null`, `body: string`, `pending: boolean`, `error: string|null`.
- On mount (effect): if `!isSupabaseConfigured()` → set a special "unconfigured" status and render a minimal note ("Comments are unavailable."), no composer. Else resolve the viewer via `supabaseBrowser().auth.getUser()` (store `viewerId`), and `listComments(supabaseBrowser(), mediaId)` → `items` / `error`. Use a cancel flag to avoid stale setState.
- **Header:** `Comments ({items.length})` using an editorial/`.mono` label consistent with the page.
- **Composer** (only when `viewerId`): a `<textarea>` bound to `body`, a "Post" button `disabled={pending || body.trim() === ""}`. On submit: call `addComment(supabaseBrowser(), viewerId, mediaId, body)`; on `{ok:false}` map error→copy ("Comment can't be empty." / "Keep it under 2000 characters." / "Something went wrong."); on `{ok:true}` clear the box and re-fetch (`listComments`) so the new comment (with author profile) appears. When `!viewerId`, render a "Sign in to comment" prompt instead of the composer.
- **List:** each item: avatar (img from `avatarUrl` else gradient-initial fallback like `ProfileHeader`), `<Link href={"/u/"+username}>@{username}</Link>`, relative time from `createdAt` (small inline helper — reuse the same approach as `FeedView`; if `FeedView` exported one, import it, else inline), and the `body` rendered as **plain text** (never `dangerouslySetInnerHTML`; `whitespace-pre-wrap` for line breaks). When `item.userId === viewerId`, show a "Delete" button that confirms then `deleteComment(supabaseBrowser(), id)` and removes the row from state.
- **States:** loading skeleton; empty → "No comments yet. Be the first."; error → an error card.

`app/media/[id]/page.tsx`: import `CommentSection`; after the closing `</div>` of the detail grid (still inside `<article>`), add:

```tsx
<section className="mx-auto max-w-[1560px] px-6 pb-16 sm:px-10">
  <CommentSection mediaId={media.id} />
</section>
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/components/comments/__tests__/CommentSection.test.tsx`, then `npm test` (full suite green), then `npx tsc --noEmit` (clean), then `npm run build` (exit 0 — `/media/[id]` still compiles).

- [ ] **Step 5: Commit**

```bash
git add src/components/comments/ src/app/media/
git commit -m "feat(comments): CommentSection on media pages (post/list/delete-own)"
```

---

## Post-implementation verification (whole feature)

- [ ] `npm test` — full suite green (217 existing + new tests).
- [ ] `npm run build` — clean; `/media/[id]` compiles.
- [ ] `npx tsc --noEmit` — clean.
- [ ] RLS + CHECK verified against the live DB (Task 1): public read; insert/delete own only; empty/oversized body rejected.
- [ ] XSS check: confirm `body` is rendered as text (no `dangerouslySetInnerHTML` anywhere in the diff).

## Deferred (not this plan)

- Threaded replies; editing; reactions/likes; @-mentions; moderation/reporting; spoiler tags; rate limiting; realtime/pagination. Communities is a separate, later slice.
