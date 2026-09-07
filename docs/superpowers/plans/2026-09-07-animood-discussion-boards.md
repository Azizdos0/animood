# Per-Anime Discussion Boards Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add per-anime threaded discussion boards — users start threads on a title and hold nested (Reddit-style) reply conversations on a dedicated thread page — coexisting with the existing flat comments. (Communities Slice A.)

**Architecture:** Two tables (`discussion_threads`, `discussion_posts` nested via `parent_post_id`) + `SECURITY DEFINER` read RPCs (author header regardless of privacy, mirroring `get_media_comments`) + a `last_activity_at` trigger + a `soft_delete_post` RPC. `src/lib/discussions/*` holds a pure `buildPostTree` and the queries. UI: a `DiscussionBoard` on the media page and a dedicated thread page rendering a nested `ThreadView`.

**Tech Stack:** Next.js 16 (App Router, RSC), TypeScript, Tailwind v4, Supabase (Postgres + RLS, `@supabase/ssr`), Vitest + Testing Library.

## Global Constraints

- **Node >= 22.4.** Full suite via `npm test` (sets `NODE_OPTIONS=--no-experimental-webstorage`, required on Node 25). **Never** run the full suite with bare `npx vitest run`. Single files may use `npx vitest run <path>`.
- **No new runtime dependencies.**
- **Reads/writes via the anon key under RLS / SECURITY DEFINER RPCs only — no service-role key.**
- **Signed-out / Supabase-unconfigured path must keep working** — the media page still renders; the board degrades to a minimal note when unconfigured and a "sign in" prompt when signed-out; the thread loader catches → `notFound()`.
- **XSS: all titles and bodies render as plain text (React escaping) — NEVER `dangerouslySetInnerHTML`.**
- **Icons:** inline SVG set only. **Page shell:** `mx-auto max-w-[1560px] px-6 sm:px-10`.
- **SupaLike** (`src/lib/sync/cloud.ts`) has `from` and `rpc` — reuse it. Mirror the RPC-based read pattern in `src/lib/comments/queries.ts`.
- **Existing 243 tests must stay green.** `npm run build` exit 0. `npx tsc --noEmit` clean.
- **Commit after every task.**

---

### Task 1: Database migration — discussion tables, RLS, trigger, RPCs

**Files:**
- Create: `supabase/migrations/0007_discussions.sql`
- Apply to project ref `teerejvdaohbtlrxxcdo` via the Supabase `apply_migration` tool.

**Interfaces:** Produces the two tables, indexes, RLS, the `bump_thread_activity` trigger, and RPCs `get_media_threads`, `get_thread`, `get_thread_posts`, `soft_delete_post` — exactly as specified in the design doc (`docs/superpowers/specs/2026-09-07-animood-discussion-boards-design.md`, §3).

- [ ] **Step 1: Write the migration file** — copy the full DDL from the design doc §3 verbatim into `supabase/migrations/0007_discussions.sql`: both `create table` blocks (with CHECK constraints + indexes), `alter table … enable row level security`, all RLS policies (wrap each `create policy` with a preceding `drop policy if exists` for idempotency), the `bump_thread_activity` function + trigger (drop trigger if exists first), and the four functions (`get_media_threads`, `get_thread`, `get_thread_posts`, `soft_delete_post`) with their `revoke all … from public` + `grant execute` lines (reads → `anon, authenticated`; `soft_delete_post` → `authenticated`).

- [ ] **Step 2: Apply the migration** via `apply_migration` (name `0007_discussions`, project_id `teerejvdaohbtlrxxcdo`).

- [ ] **Step 3: Verify** with `list_tables` (verbose) — both tables, FKs to `profiles`, CHECKs, RLS enabled. Then `execute_sql` a smoke test using the real `reiatsu` profile's `user_id`:
  - insert a thread → returns id; insert a post under it → confirm `last_activity_at` on the thread advanced past `created_at` (trigger works);
  - `select * from public.get_media_threads(<that media_id>)` returns the thread with `reply_count = 1` + author header;
  - `select * from public.get_thread_posts(<thread id>)` returns the post with author header;
  - a whitespace-only / >5000-char body insert raises `check_violation`;
  - clean up the test rows (`delete from public.discussion_threads where id = <id>` cascades posts). Then `get_advisors` (security) — no new "RLS disabled" ERROR (the pre-existing citext + anon-SECURITY-DEFINER WARNs are expected/by-design).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0007_discussions.sql
git commit -m "feat(db): discussion_threads + discussion_posts, RLS, activity trigger, RPCs"
```

---

### Task 2: `buildPostTree` (pure) + discussion types

**Files:**
- Create: `src/lib/discussions/types.ts`
- Create: `src/lib/discussions/tree.ts`
- Test: `src/lib/discussions/__tests__/tree.test.ts`

**Interfaces:**
- Produces:
  - `interface DiscussionThread { id: string; mediaId: number; userId: string; title: string; body?: string; createdAt: string; lastActivityAt: string; replyCount: number; username: string; displayName: string | null; avatarUrl: string | null }`
  - `interface DiscussionPost { id: string; threadId: string; userId: string; parentPostId: string | null; body: string; isDeleted: boolean; createdAt: string; username: string; displayName: string | null; avatarUrl: string | null }`
  - `interface PostNode extends DiscussionPost { children: PostNode[] }`
  - `buildPostTree(posts: DiscussionPost[]): PostNode[]` — roots = posts with `parentPostId` null OR whose parent id is absent from the set (orphans treated as roots); children attached under their parent, each `children` array ordered by `createdAt` asc; roots ordered by `createdAt` asc; a visited-set guard prevents infinite loops if data ever contains a cycle.

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/discussions/__tests__/tree.test.ts
import { describe, it, expect } from "vitest";
import { buildPostTree } from "@/lib/discussions/tree";
import type { DiscussionPost } from "@/lib/discussions/types";

const p = (id: string, parent: string | null, createdAt: string): DiscussionPost => ({
  id, threadId: "t1", userId: "u1", parentPostId: parent, body: "b", isDeleted: false,
  createdAt, username: "u", displayName: null, avatarUrl: null,
});

describe("buildPostTree", () => {
  it("nests children under parents, ordered by createdAt", () => {
    const tree = buildPostTree([
      p("a", null, "2026-01-01T00:00:00Z"),
      p("b", "a", "2026-01-02T00:00:00Z"),
      p("c", "a", "2026-01-03T00:00:00Z"),
    ]);
    expect(tree).toHaveLength(1);
    expect(tree[0].id).toBe("a");
    expect(tree[0].children.map((n) => n.id)).toEqual(["b", "c"]);
  });
  it("treats a post with an absent parent as a root (orphan)", () => {
    const tree = buildPostTree([p("x", "missing", "2026-01-01T00:00:00Z")]);
    expect(tree.map((n) => n.id)).toEqual(["x"]);
  });
  it("orders multiple roots by createdAt", () => {
    const tree = buildPostTree([
      p("late", null, "2026-01-05T00:00:00Z"),
      p("early", null, "2026-01-01T00:00:00Z"),
    ]);
    expect(tree.map((n) => n.id)).toEqual(["early", "late"]);
  });
  it("does not infinite-loop on a cycle", () => {
    // a -> b -> a (defensive; shouldn't happen in real data)
    const tree = buildPostTree([p("a", "b", "2026-01-01T00:00:00Z"), p("b", "a", "2026-01-02T00:00:00Z")]);
    expect(Array.isArray(tree)).toBe(true); // completes without hanging
  });
});
```

- [ ] **Step 2: Run to verify failure** — `npx vitest run src/lib/discussions/__tests__/tree.test.ts` → FAIL (module not found).

- [ ] **Step 3: Implement**

```typescript
// src/lib/discussions/types.ts
export interface DiscussionThread {
  id: string; mediaId: number; userId: string; title: string; body?: string;
  createdAt: string; lastActivityAt: string; replyCount: number;
  username: string; displayName: string | null; avatarUrl: string | null;
}
export interface DiscussionPost {
  id: string; threadId: string; userId: string; parentPostId: string | null;
  body: string; isDeleted: boolean; createdAt: string;
  username: string; displayName: string | null; avatarUrl: string | null;
}
export interface PostNode extends DiscussionPost { children: PostNode[] }
```

```typescript
// src/lib/discussions/tree.ts
import type { DiscussionPost, PostNode } from "./types";

export function buildPostTree(posts: DiscussionPost[]): PostNode[] {
  const byId = new Map<string, PostNode>();
  for (const p of posts) byId.set(p.id, { ...p, children: [] });
  const roots: PostNode[] = [];
  for (const node of byId.values()) {
    const parentId = node.parentPostId;
    const parent = parentId ? byId.get(parentId) : undefined;
    // root if no parent, parent missing (orphan), or self-reference
    if (!parent || parent.id === node.id) roots.push(node);
    else parent.children.push(node);
  }
  const byCreated = (a: PostNode, b: PostNode) => a.createdAt.localeCompare(b.createdAt);
  // Guard against cycles: only sort/recurse over nodes reachable from roots once.
  const seen = new Set<string>();
  const sortRec = (nodes: PostNode[]) => {
    nodes.sort(byCreated);
    for (const n of nodes) {
      if (seen.has(n.id)) { n.children = []; continue; }
      seen.add(n.id);
      sortRec(n.children);
    }
  };
  sortRec(roots);
  return roots;
}
```

(Note: in a true cycle a→b→a, neither is null-parent nor orphan, so both attach as children and neither becomes a root — `roots` is empty and the function returns `[]` without hanging. The `seen` guard additionally protects the recursion. The test only requires it completes.)

- [ ] **Step 4: Run to verify pass** — `npx vitest run src/lib/discussions/__tests__/tree.test.ts` → PASS. Then `npm test` (green).

- [ ] **Step 5: Commit**

```bash
git add src/lib/discussions/types.ts src/lib/discussions/tree.ts src/lib/discussions/__tests__/tree.test.ts
git commit -m "feat(discussions): DiscussionThread/Post types + pure buildPostTree"
```

---

### Task 3: Discussion data-access queries (mocked Supabase)

**Files:**
- Create: `src/lib/discussions/queries.ts`
- Test: `src/lib/discussions/__tests__/queries.test.ts`

**Interfaces:**
- Consumes: `SupaLike` (`@/lib/sync/cloud`), the types (Task 2).
- Produces (all take `supabase: SupaLike`):
  - `listThreads(supabase, mediaId, limit=100): Promise<DiscussionThread[]>` — `rpc("get_media_threads", { p_media_id, p_limit })`; map rows (drop rows with no `username`); `reply_count` → Number.
  - `getThread(supabase, threadId): Promise<DiscussionThread | null>` — `rpc("get_thread", { p_thread_id })`; first row (with `body`) or null.
  - `createThread(supabase, userId, mediaId, title, body): Promise<{ ok:true; id:string } | { ok:false; error:"empty"|"too_long"|"unknown" }>` — trim; title empty→"empty", title>200→"too_long", body empty→"empty", body>5000→"too_long"; `from("discussion_threads").insert({user_id,media_id,title,body}).select("id").single()`; map error→"unknown"; return the new id.
  - `getThreadPosts(supabase, threadId): Promise<DiscussionPost[]>` — `rpc("get_thread_posts", { p_thread_id })`; map (drop no-username rows).
  - `createPost(supabase, userId, threadId, parentPostId, body): Promise<{ ok:true } | { ok:false; error:"empty"|"too_long"|"unknown" }>` — trim; empty→"empty", >5000→"too_long"; `insert({user_id,thread_id,parent_post_id,body})`.
  - `deletePost(supabase, postId): Promise<void>` — `rpc("soft_delete_post", { p_post_id })`; throw on error.
  - `deleteThread(supabase, threadId): Promise<void>` — `from("discussion_threads").delete().eq("id", threadId)`; throw on error.

- [ ] **Step 1: Write the failing test** — cover: `listThreads` maps an rpc row (incl. `replyCount` number, author) and drops a no-username row; `createThread` rejects empty title, empty body, and >5000 body BEFORE inserting (spy `from` not called), and returns `{ ok:true, id }` on success; `createPost` rejects empty/too_long before insert; `getThread` returns null on empty; `deletePost` calls `rpc("soft_delete_post", {p_post_id})`; `deleteThread` deletes by id. Use the mocking style from `src/lib/comments/__tests__/queries.test.ts` and `src/lib/discover/__tests__/queries.test.ts` (fake `{ from }` / `{ rpc }` objects). Write real assertions (not vacuous).

```typescript
// src/lib/discussions/__tests__/queries.test.ts  (representative cases; add the rest per the list above)
import { describe, it, expect, vi } from "vitest";
import { listThreads, createThread, deletePost } from "@/lib/discussions/queries";

describe("listThreads", () => {
  it("maps an rpc row and coerces reply_count", async () => {
    const supabase = { rpc: async () => ({ data: [{
      id: "t1", media_id: 5, user_id: "u1", title: "Hi", created_at: "t", last_activity_at: "t",
      reply_count: 3, username: "friend", display_name: "Friend", avatar_url: null,
    }], error: null }) } as never;
    const rows = await listThreads(supabase, 5);
    expect(rows[0]).toMatchObject({ id: "t1", mediaId: 5, replyCount: 3, username: "friend" });
  });
});

describe("createThread", () => {
  it("rejects an empty title before inserting", async () => {
    const from = vi.fn();
    expect(await createThread({ from } as never, "u1", 5, "  ", "body")).toEqual({ ok: false, error: "empty" });
    expect(from).not.toHaveBeenCalled();
  });
  it("returns the new id on success", async () => {
    const single = async () => ({ data: { id: "new" }, error: null });
    const supabase = { from: () => ({ insert: () => ({ select: () => ({ single }) }) }) } as never;
    expect(await createThread(supabase, "u1", 5, "Title", "Body")).toEqual({ ok: true, id: "new" });
  });
});

describe("deletePost", () => {
  it("calls the soft_delete_post rpc", async () => {
    const rpc = vi.fn(async () => ({ error: null }));
    await deletePost({ rpc } as never, "p1");
    expect(rpc).toHaveBeenCalledWith("soft_delete_post", { p_post_id: "p1" });
  });
});
```

- [ ] **Step 2: Run to verify failure** — `npx vitest run src/lib/discussions/__tests__/queries.test.ts` → FAIL.

- [ ] **Step 3: Implement** `src/lib/discussions/queries.ts` per the Interfaces above, mirroring `src/lib/comments/queries.ts` (RPC reads + validated inserts). Constants `TITLE_MAX = 200`, `BODY_MAX = 5000`.

- [ ] **Step 4: Run to verify pass** — the test file, then `npm test`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/discussions/queries.ts src/lib/discussions/__tests__/queries.test.ts
git commit -m "feat(discussions): list/get/create/delete thread + post queries"
```

---

### Task 4: DiscussionBoard on the media page

**Files:**
- Create: `src/components/discussions/DiscussionBoard.tsx` (client)
- Modify: `src/app/media/[id]/page.tsx` (render `<DiscussionBoard mediaId={media.id} />` above the existing Comments `<section>`)
- Test: `src/components/discussions/__tests__/DiscussionBoard.test.tsx`

**Interfaces:**
- Consumes: `listThreads`/`createThread` (Task 3), `supabaseBrowser`/`isSupabaseConfigured` (`@/lib/supabase/client`).
- Produces: `DiscussionBoard({ mediaId }: { mediaId: number })`.

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/discussions/__tests__/DiscussionBoard.test.tsx
import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
const listThreads = vi.fn();
const createThread = vi.fn(async () => ({ ok: true, id: "t9" }));
vi.mock("@/lib/discussions/queries", () => ({
  listThreads: (...a: unknown[]) => listThreads(...a),
  createThread: (...a: unknown[]) => createThread(...a),
}));
let user: { id: string } | null = null;
vi.mock("@/lib/supabase/client", () => ({
  isSupabaseConfigured: () => true,
  supabaseBrowser: () => ({ auth: { getUser: async () => ({ data: { user } }) } }),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
import { DiscussionBoard } from "@/components/discussions/DiscussionBoard";

const thread = {
  id: "t1", mediaId: 5, userId: "u1", title: "Best arc?", createdAt: "2026-02-01T00:00:00Z",
  lastActivityAt: "2026-02-02T00:00:00Z", replyCount: 4, username: "friend", displayName: "Friend", avatarUrl: null,
};
beforeEach(() => { listThreads.mockResolvedValue([thread]); user = null; });

describe("DiscussionBoard", () => {
  it("renders threads with title and reply count", async () => {
    render(<DiscussionBoard mediaId={5} />);
    expect(await screen.findByText("Best arc?")).toBeInTheDocument();
    expect(screen.getByText(/4/)).toBeInTheDocument();
  });
  it("shows a sign-in prompt (no title input) when signed out", async () => {
    render(<DiscussionBoard mediaId={5} />);
    await screen.findByText("Best arc?");
    expect(screen.queryByPlaceholderText(/title/i)).toBeNull();
    expect(screen.getByText(/sign in to start a discussion/i)).toBeInTheDocument();
  });
  it("shows the composer when signed in", async () => {
    user = { id: "viewer" };
    render(<DiscussionBoard mediaId={5} />);
    await waitFor(() => expect(screen.getByPlaceholderText(/title/i)).toBeInTheDocument());
  });
});
```

- [ ] **Step 2: Run to verify failure** — `npx vitest run src/components/discussions/__tests__/DiscussionBoard.test.tsx` → FAIL.

- [ ] **Step 3: Implement**

`DiscussionBoard.tsx` (client): on mount, if `!isSupabaseConfigured()` → minimal "Discussions unavailable." note; else resolve viewer (`supabaseBrowser().auth.getUser()`) and `listThreads(supabaseBrowser(), mediaId)` (cancel flag). Header "Discussions ({threads.length})". Composer (only when viewer): title `<input placeholder="Thread title…">` + body `<textarea>` + "Post" (disabled while either empty or pending); on submit `createThread(...)`, map empty/too_long/unknown → copy, on success `router.push('/media/'+mediaId+'/discussions/'+id)`. When no viewer → "Sign in to start a discussion." Thread list: each row links to `/media/${mediaId}/discussions/${thread.id}`, shows title, `@username`, reply count, relative last-activity (inline helper like FeedView). Loading skeleton / empty ("No discussions yet — start one.") / error card.

`app/media/[id]/page.tsx`: import `DiscussionBoard`; add a `<section className="mx-auto max-w-[1560px] px-6 sm:px-10">` with `<DiscussionBoard mediaId={media.id} />` immediately BEFORE the existing Comments `<section>` (line ~120).

- [ ] **Step 4: Run to verify pass** — the test file, `npm test`, `npx tsc --noEmit`, `npm run build` (exit 0).

- [ ] **Step 5: Commit**

```bash
git add src/components/discussions/DiscussionBoard.tsx src/app/media/
git commit -m "feat(discussions): DiscussionBoard thread list + composer on media page"
```

---

### Task 5: ThreadView (nested tree + reply + delete)

**Files:**
- Create: `src/components/discussions/ThreadView.tsx` (client)
- Test: `src/components/discussions/__tests__/ThreadView.test.tsx`

**Interfaces:**
- Consumes: `buildPostTree` (Task 2), `getThreadPosts`/`createPost`/`deletePost` (Task 3), `supabaseBrowser` (`@/lib/supabase/client`), `DiscussionPost` type.
- Produces: `ThreadView({ threadId, initialPosts }: { threadId: string; initialPosts: DiscussionPost[] })` — resolves the viewer on mount; builds the tree via `buildPostTree`; renders it recursively.

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/discussions/__tests__/ThreadView.test.tsx
import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
const getThreadPosts = vi.fn();
const createPost = vi.fn(async () => ({ ok: true }));
const deletePost = vi.fn(async () => {});
vi.mock("@/lib/discussions/queries", () => ({
  getThreadPosts: (...a: unknown[]) => getThreadPosts(...a),
  createPost: (...a: unknown[]) => createPost(...a),
  deletePost: (...a: unknown[]) => deletePost(...a),
}));
let user: { id: string } | null = null;
vi.mock("@/lib/supabase/client", () => ({
  supabaseBrowser: () => ({ auth: { getUser: async () => ({ data: { user } }) } }),
}));
import { ThreadView } from "@/components/discussions/ThreadView";
import type { DiscussionPost } from "@/lib/discussions/types";

const post = (o: Partial<DiscussionPost> = {}): DiscussionPost => ({
  id: "p1", threadId: "t1", userId: "u1", parentPostId: null, body: "great point",
  isDeleted: false, createdAt: "2026-02-01T00:00:00Z", username: "friend", displayName: null, avatarUrl: null, ...o,
});
beforeEach(() => { user = null; getThreadPosts.mockResolvedValue([]); });

describe("ThreadView", () => {
  it("renders the nested posts", () => {
    render(<ThreadView threadId="t1" initialPosts={[post()]} />);
    expect(screen.getByText("great point")).toBeInTheDocument();
    expect(screen.getByText(/@friend/)).toBeInTheDocument();
  });
  it("renders a deleted post as [deleted] and still shows its child", () => {
    render(<ThreadView threadId="t1" initialPosts={[
      post({ id: "p1", isDeleted: true, body: "" }),
      post({ id: "p2", parentPostId: "p1", body: "child reply" }),
    ]} />);
    expect(screen.getByText(/\[deleted\]/i)).toBeInTheDocument();
    expect(screen.getByText("child reply")).toBeInTheDocument();
  });
  it("shows a Delete control only on the viewer's own post", () => {
    user = { id: "u1" };
    render(<ThreadView threadId="t1" initialPosts={[post({ userId: "u1" })]} />);
    expect(screen.getByRole("button", { name: /delete/i })).toBeInTheDocument();
  });
  it("hides Reply composers when signed out", () => {
    render(<ThreadView threadId="t1" initialPosts={[post()]} />);
    expect(screen.queryByRole("button", { name: /^reply$/i })).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify failure** — `npx vitest run src/components/discussions/__tests__/ThreadView.test.tsx` → FAIL.

- [ ] **Step 3: Implement**

`ThreadView.tsx` (client): state `posts` (seeded from `initialPosts`), `viewerId` (resolved on mount via `supabaseBrowser().auth.getUser()`), plus per-post reply/pending UI state. `const tree = buildPostTree(posts)`. Render `tree` with a recursive `PostNode`-renderer: indentation via left padding/border keyed to depth, **capped at ~5** (`Math.min(depth, 5)`). Each node: avatar fallback + `<Link href={"/u/"+username}>@{username}</Link>`, relative time, body — if `isDeleted` render a muted "[deleted]" placeholder, else `{body}` in a `whitespace-pre-wrap` block (plain text). When `viewerId`: a **Reply** toggle → inline `<textarea>` + Post → `createPost(supabaseBrowser(), viewerId, threadId, node.id, body)`; on `{ok:true}` re-fetch via `getThreadPosts` and collapse the composer. When `node.userId === viewerId` and not already deleted: a **Delete** button → confirm → `deletePost(...)` → re-fetch. A top-level reply composer (parentPostId = null) above/below the tree, shown when `viewerId`. Mutations re-fetch `getThreadPosts` (cancel-safe). No composers when `!viewerId`.

- [ ] **Step 4: Run to verify pass** — the test file, then `npm test`, `npx tsc --noEmit`.

- [ ] **Step 5: Commit**

```bash
git add src/components/discussions/ThreadView.tsx src/components/discussions/__tests__/ThreadView.test.tsx
git commit -m "feat(discussions): nested ThreadView with reply + soft-delete"
```

---

### Task 6: Thread page + `loadThread` server loader

**Files:**
- Create: `src/lib/discussions/server.ts` (loader)
- Create: `src/app/media/[id]/discussions/[threadId]/page.tsx` (server)
- Test: `src/lib/discussions/__tests__/server.test.ts`

**Interfaces:**
- Consumes: `getThread`/`getThreadPosts` (Task 3), `supabaseServer`, `ThreadView` (Task 5), `getMediaById` (`@/lib/anilist/media`).
- Produces:
  - `type ThreadPageState = { state: "not_found" } | { state: "ok"; thread: DiscussionThread; posts: DiscussionPost[] }`
  - `loadThread(mediaId: number, threadId: string): Promise<ThreadPageState>` — `getThread`; null OR `thread.mediaId !== mediaId` → `not_found`; else `getThreadPosts` → ok.

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/discussions/__tests__/server.test.ts
import { describe, it, expect, vi } from "vitest";
const thread = { id: "t1", mediaId: 5, userId: "u1", title: "Hi", body: "Body",
  createdAt: "t", lastActivityAt: "t", replyCount: 0, username: "f", displayName: null, avatarUrl: null };
vi.mock("@/lib/supabase/server", () => ({ supabaseServer: async () => ({}) }));
vi.mock("@/lib/discussions/queries", () => ({
  getThread: async (_s: unknown, id: string) => (id === "t1" ? thread : null),
  getThreadPosts: async () => ([{ id: "p1", threadId: "t1", userId: "u1", parentPostId: null,
    body: "hi", isDeleted: false, createdAt: "t", username: "f", displayName: null, avatarUrl: null }]),
}));
import { loadThread } from "@/lib/discussions/server";

describe("loadThread", () => {
  it("not_found for a missing thread", async () => {
    expect(await loadThread(5, "nope")).toEqual({ state: "not_found" });
  });
  it("not_found when the thread's media_id doesn't match the URL", async () => {
    expect(await loadThread(999, "t1")).toEqual({ state: "not_found" });
  });
  it("ok returns the thread and its posts", async () => {
    const res = await loadThread(5, "t1");
    expect(res.state).toBe("ok");
    if (res.state === "ok") { expect(res.thread.title).toBe("Hi"); expect(res.posts).toHaveLength(1); }
  });
});
```

- [ ] **Step 2: Run to verify failure** — `npx vitest run src/lib/discussions/__tests__/server.test.ts` → FAIL.

- [ ] **Step 3: Implement**

```typescript
// src/lib/discussions/server.ts
import { supabaseServer } from "@/lib/supabase/server";
import { getThread, getThreadPosts } from "@/lib/discussions/queries";
import type { DiscussionThread, DiscussionPost } from "./types";

export type ThreadPageState =
  | { state: "not_found" }
  | { state: "ok"; thread: DiscussionThread; posts: DiscussionPost[] };

export async function loadThread(mediaId: number, threadId: string): Promise<ThreadPageState> {
  const supabase = await supabaseServer();
  const thread = await getThread(supabase as never, threadId);
  if (!thread || thread.mediaId !== mediaId) return { state: "not_found" };
  const posts = await getThreadPosts(supabase as never, threadId);
  return { state: "ok", thread, posts };
}
```

`app/media/[id]/discussions/[threadId]/page.tsx` (server): `const { id, threadId } = await params;` → `const mediaId = Number(id)` (NaN → `notFound()`); fetch the media title via `getMediaById(mediaId)` (best-effort in try/catch — a title failure shouldn't 404 the thread; fall back to "this title"); `const res = await loadThread(mediaId, threadId).catch(() => ({ state: "not_found" as const }))`; `not_found` → `notFound()`. Render inside the page shell: a back link `← Discussions for <title>` to `/media/${mediaId}`, the opening post card (`thread.title` as an `<h1>`, `thread.body` as plain-text `whitespace-pre-wrap`, `@thread.username` + relative time), then `<ThreadView threadId={threadId} initialPosts={res.posts} />`.

- [ ] **Step 4: Run to verify pass** — `npx vitest run src/lib/discussions/__tests__/server.test.ts`, then `npm test`, `npx tsc --noEmit`, `npm run build` (exit 0; confirm `/media/[id]/discussions/[threadId]` compiles).

- [ ] **Step 5: Commit**

```bash
git add src/lib/discussions/server.ts src/app/media/
git commit -m "feat(discussions): thread page + loadThread (media-id guarded)"
```

---

## Post-implementation verification (whole feature)

- [ ] `npm test` — full suite green (243 existing + new tests).
- [ ] `npm run build` — clean; `/media/[id]/discussions/[threadId]` compiles.
- [ ] `npx tsc --noEmit` — clean.
- [ ] RLS/CHECK/RPCs verified against the live DB (Task 1).
- [ ] XSS check: no `dangerouslySetInnerHTML` anywhere in the diff; titles/bodies render as text.

## Deferred (not this plan)

- Slice B (user-created topic communities), editing, reactions/votes, @-mentions, moderation/reporting, pinning, pagination, realtime, reply notifications.
