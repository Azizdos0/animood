import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

const listCommunityThreads = vi.fn();
const createCommunityThread = vi.fn(async (..._a: unknown[]) => ({ ok: true, id: "t9" }));
vi.mock("@/lib/communities/queries", () => ({
  listCommunityThreads: (...a: unknown[]) => listCommunityThreads(...a),
  createCommunityThread: (...a: unknown[]) => createCommunityThread(...a),
}));
vi.mock("@/lib/supabase/client", () => ({
  isSupabaseConfigured: () => true,
  supabaseBrowser: () => ({ auth: { getUser: async () => ({ data: { user: null } }) } }),
}));
const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh: vi.fn() }) }));

import { CommunityBoard } from "@/components/communities/CommunityBoard";
import type { Community } from "@/lib/communities/types";
import type { DiscussionThread } from "@/lib/discussions/types";

const community: Community = {
  id: "c1", slug: "isekai-fans", name: "Isekai Fans", description: "For fans",
  memberCount: 12, createdBy: "u0", createdAt: "2026-01-01T00:00:00Z",
};

const thread: DiscussionThread = {
  id: "t1", mediaId: 0, userId: "u1", title: "Best arc?", createdAt: "2026-02-01T00:00:00Z",
  lastActivityAt: "2026-02-02T00:00:00Z", replyCount: 4, username: "friend", displayName: "Friend", avatarUrl: null,
  communityId: "c1", isPinned: false,
};

const pinnedThread: DiscussionThread = {
  ...thread, id: "t2", title: "Read this first", isPinned: true,
};

beforeEach(() => {
  listCommunityThreads.mockReset().mockResolvedValue([thread]);
  createCommunityThread.mockClear();
  push.mockClear();
});

describe("CommunityBoard", () => {
  it("renders initialThreads immediately without a loading skeleton flash", () => {
    render(<CommunityBoard community={community} viewerRole="member" initialThreads={[thread]} signedIn={true} />);
    expect(screen.getByText("Best arc?")).toBeInTheDocument();
    expect(document.querySelector(".skeleton")).toBeNull();
  });

  it("does not render the composer and shows a join note when signed out (viewerRole null)", async () => {
    render(<CommunityBoard community={community} viewerRole={null} initialThreads={[thread]} signedIn={false} />);
    await screen.findByText("Best arc?");
    expect(screen.queryByPlaceholderText(/title/i)).toBeNull();
    expect(screen.getByText(/sign in to join the conversation/i)).toBeInTheDocument();
  });

  it("renders the composer when viewerRole is member", async () => {
    render(<CommunityBoard community={community} viewerRole="member" initialThreads={[thread]} signedIn={true} />);
    await waitFor(() => expect(screen.getByPlaceholderText(/title/i)).toBeInTheDocument());
  });

  it("shows a pin marker for pinned threads", async () => {
    listCommunityThreads.mockResolvedValue([pinnedThread]);
    render(<CommunityBoard community={community} viewerRole="member" initialThreads={[pinnedThread]} signedIn={true} />);
    const row = await screen.findByText("Read this first");
    expect(row.closest("a")?.textContent).toMatch(/📌/);
  });

  it("submits a new thread via createCommunityThread and routes to it", async () => {
    const { default: userEvent } = await import("@testing-library/user-event");
    const user = userEvent.setup();
    render(<CommunityBoard community={community} viewerRole="member" initialThreads={[thread]} signedIn={true} />);
    const titleInput = await screen.findByPlaceholderText(/title/i);
    const bodyInput = screen.getByPlaceholderText(/discuss/i);
    await user.type(titleInput, "New thread");
    await user.type(bodyInput, "Some body text");
    const button = screen.getByRole("button", { name: /post/i });
    await user.click(button);
    await waitFor(() => expect(createCommunityThread).toHaveBeenCalledWith(expect.anything(), "c1", "New thread", "Some body text"));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/communities/isekai-fans/t9"));
  });
});
