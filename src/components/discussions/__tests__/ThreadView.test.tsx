import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
const getThreadPosts = vi.fn();
const createPost = vi.fn(async (..._a: unknown[]) => ({ ok: true }));
const deletePost = vi.fn(async (..._a: unknown[]) => {});
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
  it("shows a Delete control only on the viewer's own post", async () => {
    user = { id: "u1" };
    render(<ThreadView threadId="t1" initialPosts={[post({ userId: "u1" })]} />);
    expect(await screen.findByRole("button", { name: /delete/i })).toBeInTheDocument();
  });
  it("hides Reply composers when signed out", () => {
    render(<ThreadView threadId="t1" initialPosts={[post()]} />);
    expect(screen.queryByRole("button", { name: /^reply$/i })).toBeNull();
  });
});
