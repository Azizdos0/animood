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
