import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

const createCommunityPost = vi.fn(async (..._a: unknown[]) => ({ ok: true as const }));
const moderateRemovePost = vi.fn(async (..._a: unknown[]) => ({ ok: true as const }));
const moderateDeleteThread = vi.fn(async (..._a: unknown[]) => ({ ok: true as const }));
const setThreadPinned = vi.fn(async (..._a: unknown[]) => ({ ok: true as const }));
vi.mock("@/lib/communities/queries", () => ({
  createCommunityPost: (...a: unknown[]) => createCommunityPost(...a),
  moderateRemovePost: (...a: unknown[]) => moderateRemovePost(...a),
  moderateDeleteThread: (...a: unknown[]) => moderateDeleteThread(...a),
  setThreadPinned: (...a: unknown[]) => setThreadPinned(...a),
}));
let user: { id: string } | null = { id: "u1" };
vi.mock("@/lib/supabase/client", () => ({
  supabaseBrowser: () => ({ auth: { getUser: async () => ({ data: { user } }) } }),
}));
vi.mock("@/lib/discussions/queries", () => ({
  getThreadPosts: vi.fn(async () => []),
  createPost: vi.fn(async () => ({ ok: true })),
  deletePost: vi.fn(async () => {}),
}));
const push = vi.fn();
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh }) }));

import { CommunityThreadView } from "@/components/communities/CommunityThreadView";
import type { DiscussionThread, DiscussionPost } from "@/lib/discussions/types";

const thread: DiscussionThread = {
  id: "t1", mediaId: 0, userId: "u0", title: "Best arc?", createdAt: "2026-02-01T00:00:00Z",
  lastActivityAt: "2026-02-02T00:00:00Z", replyCount: 1, username: "friend", displayName: "Friend", avatarUrl: null,
  communityId: "c1", isPinned: false,
};

const post = (o: Partial<DiscussionPost> = {}): DiscussionPost => ({
  id: "p1", threadId: "t1", userId: "u2", parentPostId: null, body: "great point",
  isDeleted: false, createdAt: "2026-02-01T00:00:00Z", username: "other", displayName: null, avatarUrl: null, ...o,
});

beforeEach(() => {
  user = { id: "u1" };
  createCommunityPost.mockClear();
  moderateRemovePost.mockClear();
  moderateDeleteThread.mockClear();
  setThreadPinned.mockClear();
  push.mockClear();
  refresh.mockClear();
});

describe("CommunityThreadView", () => {
  it("shows Pin and Remove thread controls for a moderator", async () => {
    render(<CommunityThreadView slug="isekai-fans" thread={thread} initialPosts={[post()]} viewerRole="owner" />);
    expect(await screen.findByRole("button", { name: /^pin$/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /remove thread/i })).toBeInTheDocument();
  });

  it("does not show moderation controls for a regular member", async () => {
    render(<CommunityThreadView slug="isekai-fans" thread={thread} initialPosts={[post()]} viewerRole="member" />);
    await screen.findByText("great point");
    expect(screen.queryByRole("button", { name: /^pin$/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /remove thread/i })).toBeNull();
  });

  it("shows Remove on another user's post for a moderator and calls moderateRemovePost", async () => {
    window.confirm = vi.fn(() => true);
    render(<CommunityThreadView slug="isekai-fans" thread={thread} initialPosts={[post({ userId: "u2" })]} viewerRole="owner" />);
    const removeBtn = await screen.findByRole("button", { name: /^remove$/i });
    fireEvent.click(removeBtn);
    await waitFor(() => expect(moderateRemovePost).toHaveBeenCalledWith(expect.anything(), "p1"));
  });

  it("refreshes the view after a moderator removes a post", async () => {
    window.confirm = vi.fn(() => true);
    render(<CommunityThreadView slug="isekai-fans" thread={thread} initialPosts={[post({ userId: "u2" })]} viewerRole="owner" />);
    const removeBtn = await screen.findByRole("button", { name: /^remove$/i });
    fireEvent.click(removeBtn);
    await waitFor(() => expect(moderateRemovePost).toHaveBeenCalledWith(expect.anything(), "p1"));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it("uses createCommunityPost (not the media createPost) for replies when the viewer is a member", async () => {
    render(<CommunityThreadView slug="isekai-fans" thread={thread} initialPosts={[]} viewerRole="member" />);
    const textarea = await screen.findByLabelText("Reply body");
    fireEvent.change(textarea, { target: { value: "my reply" } });
    fireEvent.click(screen.getByRole("button", { name: /^post$/i }));
    await waitFor(() => expect(createCommunityPost).toHaveBeenCalledWith(expect.anything(), "t1", null, "my reply"));
  });

  it("hides the composer for a non-member (viewerRole null)", async () => {
    render(<CommunityThreadView slug="isekai-fans" thread={thread} initialPosts={[post()]} viewerRole={null} />);
    await screen.findByText("great point");
    expect(screen.queryByLabelText("Reply body")).toBeNull();
    expect(screen.queryByRole("button", { name: /^reply$/i })).toBeNull();
  });
});
