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
