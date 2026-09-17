import { render, screen, waitFor, fireEvent } from "@testing-library/react";
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

  it("shows a Remove control on another user's post when canModerate, and calls onModerateRemove", async () => {
    user = { id: "mod1" };
    const onModerateRemove = vi.fn(async () => {});
    window.confirm = vi.fn(() => true);
    render(
      <ThreadView
        threadId="t1"
        initialPosts={[post({ userId: "u1" })]}
        canModerate
        onModerateRemove={onModerateRemove}
      />
    );
    const removeBtn = await screen.findByRole("button", { name: /^remove$/i });
    removeBtn.click();
    await waitFor(() => expect(onModerateRemove).toHaveBeenCalledWith("p1"));
  });

  it("does not show Remove on the viewer's own post even when canModerate", async () => {
    user = { id: "u1" };
    render(<ThreadView threadId="t1" initialPosts={[post({ userId: "u1" })]} canModerate onModerateRemove={vi.fn()} />);
    expect(screen.queryByRole("button", { name: /^remove$/i })).toBeNull();
  });

  it("uses createReply instead of createPost when provided, for the top-level composer", async () => {
    user = { id: "u1" };
    const injectedReply = vi.fn(async () => ({ ok: true as const }));
    render(<ThreadView threadId="t1" initialPosts={[]} createReply={injectedReply} />);
    const textarea = await screen.findByLabelText("Reply body");
    fireEvent.change(textarea, { target: { value: "hello there" } });
    fireEvent.click(screen.getByRole("button", { name: /^post$/i }));
    await waitFor(() => expect(injectedReply).toHaveBeenCalledWith("t1", null, "hello there"));
    expect(createPost).not.toHaveBeenCalled();
  });

  it("hides the composer and per-post Reply button when canReply is false", async () => {
    user = { id: "u1" };
    render(<ThreadView threadId="t1" initialPosts={[post({ userId: "u2" })]} canReply={false} />);
    expect(screen.queryByLabelText("Reply body")).toBeNull();
    expect(screen.queryByRole("button", { name: /^reply$/i })).toBeNull();
  });
});
