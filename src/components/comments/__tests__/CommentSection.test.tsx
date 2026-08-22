import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

const listComments = vi.fn();
const addComment = vi.fn(async (..._a: unknown[]) => ({ ok: true }));
const deleteComment = vi.fn(async (..._a: unknown[]) => {});
vi.mock("@/lib/comments/queries", () => ({
  listComments: (...a: unknown[]) => listComments(...a),
  addComment: (...a: unknown[]) => addComment(...a),
  deleteComment: (...a: unknown[]) => deleteComment(...a),
}));
let currentUser: { id: string } | null = null;
vi.mock("@/lib/supabase/client", () => ({
  isSupabaseConfigured: () => true,
  supabaseBrowser: () => ({ auth: { getUser: async () => ({ data: { user: currentUser } }) } }),
}));

import { CommentSection } from "@/components/comments/CommentSection";

const comment = {
  id: "c1", mediaId: 5, userId: "u1", username: "friend", displayName: "Friend",
  avatarUrl: null, body: "great show", createdAt: "2026-02-01T00:00:00Z",
};

beforeEach(() => { listComments.mockResolvedValue([comment]); currentUser = null; });

describe("CommentSection", () => {
  it("renders fetched comments", async () => {
    render(<CommentSection mediaId={5} />);
    expect(await screen.findByText("great show")).toBeInTheDocument();
    expect(screen.getByText(/@friend/)).toBeInTheDocument();
  });
  it("shows a sign-in prompt (no composer) when signed out", async () => {
    render(<CommentSection mediaId={5} />);
    await screen.findByText("great show");
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.getByText(/sign in to comment/i)).toBeInTheDocument();
  });
  it("shows the composer when signed in", async () => {
    currentUser = { id: "viewer" };
    render(<CommentSection mediaId={5} />);
    await waitFor(() => expect(screen.getByRole("textbox")).toBeInTheDocument());
  });
  it("shows a Delete control only on the viewer's own comment", async () => {
    currentUser = { id: "u1" }; // same as comment.userId
    render(<CommentSection mediaId={5} />);
    await screen.findByText("great show");
    expect(screen.getByRole("button", { name: /delete/i })).toBeInTheDocument();
  });
});
