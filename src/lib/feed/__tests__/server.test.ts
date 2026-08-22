import { describe, it, expect, vi } from "vitest";

// Build a chainable query stub whose terminal awaited value is `result`.
function tableStub(result: { data: unknown; error: unknown }) {
  const q: Record<string, unknown> = {};
  for (const m of ["select", "eq", "in", "order", "limit"]) q[m] = () => q;
  // make the object awaitable
  (q as { then: unknown }).then = (res: (v: unknown) => void) => res(result);
  return q;
}

let user: { id: string } | null;
const follows = { data: [{ following_id: "u2" }], error: null };
const entries = { data: [
  { user_id: "u2", media_id: 5, status: "completed", score: 9, updated_at: "2026-02-01T00:00:00Z" },
], error: null };
const profiles = { data: [
  { user_id: "u2", username: "friend", display_name: "Friend", avatar_url: null },
], error: null };

vi.mock("@/lib/supabase/server", () => ({
  supabaseServer: async () => ({
    auth: { getUser: async () => ({ data: { user } }) },
    from: (table: string) =>
      table === "follows" ? tableStub(follows)
      : table === "list_entries" ? tableStub(entries)
      : tableStub(profiles),
  }),
}));

import { loadFeed } from "@/lib/feed/server";

describe("loadFeed", () => {
  it("returns signed_out when there is no user", async () => {
    user = null;
    expect(await loadFeed()).toEqual({ state: "signed_out" });
  });
  it("maps followed users' entries into FeedItems", async () => {
    user = { id: "u1" };
    const res = await loadFeed();
    expect(res.state).toBe("ok");
    if (res.state === "ok") {
      expect(res.items).toHaveLength(1);
      expect(res.items[0]).toMatchObject({ username: "friend", mediaId: 5, status: "completed", score: 9 });
    }
  });
});
