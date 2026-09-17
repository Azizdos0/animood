import { describe, it, expect, vi } from "vitest";

const community = {
  id: "c1", slug: "isekai", name: "Isekai", description: "d",
  memberCount: 3, createdBy: "u1", createdAt: "t",
};
const thread = {
  id: "t1", mediaId: 0, userId: "u1", title: "Hi", createdAt: "t", lastActivityAt: "t",
  replyCount: 0, username: "f", displayName: null, avatarUrl: null, communityId: "c1", isPinned: false,
};
const otherCommunityThread = { ...thread, id: "t2", communityId: "other-community" };

vi.mock("@/lib/supabase/server", () => ({ supabaseServer: async () => ({}) }));
vi.mock("@/lib/discussions/queries", () => ({
  getThread: async (_s: unknown, id: string) => {
    if (id === "t1") return thread;
    if (id === "t2") return otherCommunityThread;
    return null;
  },
  getThreadPosts: async () => ([{ id: "p1", threadId: "t1", userId: "u1", parentPostId: null,
    body: "hi", isDeleted: false, createdAt: "t", username: "f", displayName: null, avatarUrl: null }]),
}));
vi.mock("@/lib/communities/queries", () => ({
  getCommunityBySlug: async (_s: unknown, slug: string) => (slug === "isekai" ? community : null),
  getMyRole: async () => "member",
  listCommunityThreads: async () => [thread],
}));

import { loadCommunityPage, loadCommunityThread } from "@/lib/communities/server";

describe("loadCommunityPage", () => {
  it("returns not_found when the community doesn't exist", async () => {
    expect(await loadCommunityPage("missing", null)).toEqual({ state: "not_found" });
  });

  it("returns ok with viewerRole and threads when found", async () => {
    const res = await loadCommunityPage("isekai", "u1");
    expect(res.state).toBe("ok");
    if (res.state === "ok") {
      expect(res.community).toEqual(community);
      expect(res.viewerRole).toBe("member");
      expect(res.threads).toEqual([thread]);
    }
  });

  it("skips role lookup for an anonymous viewer", async () => {
    const res = await loadCommunityPage("isekai", null);
    expect(res.state).toBe("ok");
    if (res.state === "ok") expect(res.viewerRole).toBeNull();
  });
});

describe("loadCommunityThread", () => {
  it("returns not_found when the community doesn't exist", async () => {
    expect(await loadCommunityThread("missing", "t1", null)).toEqual({ state: "not_found" });
  });

  it("returns not_found when the thread's communityId doesn't match the slug's community", async () => {
    expect(await loadCommunityThread("isekai", "t2", null)).toEqual({ state: "not_found" });
  });

  it("returns ok with community, thread, posts, viewerRole", async () => {
    const res = await loadCommunityThread("isekai", "t1", "u1");
    expect(res.state).toBe("ok");
    if (res.state === "ok") {
      expect(res.community).toEqual(community);
      expect(res.thread).toEqual(thread);
      expect(res.posts).toHaveLength(1);
      expect(res.viewerRole).toBe("member");
    }
  });
});
