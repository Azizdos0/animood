import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
const listThreads = vi.fn();
const createThread = vi.fn(async (..._a: unknown[]) => ({ ok: true, id: "t9" }));
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
