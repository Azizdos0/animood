import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
const followUser = vi.fn(async (..._a: unknown[]) => {});
const unfollowUser = vi.fn(async (..._a: unknown[]) => {});
let getUserImpl: () => Promise<{ data: { user: { id: string } | null } }> = async () => ({
  data: { user: { id: "viewer" } },
});
vi.mock("@/lib/follow/queries", () => ({
  followUser: (...a: unknown[]) => followUser(...a),
  unfollowUser: (...a: unknown[]) => unfollowUser(...a),
}));
vi.mock("@/lib/supabase/client", () => ({
  supabaseBrowser: () => ({ auth: { getUser: () => getUserImpl() } }),
}));
import { FollowButton } from "@/components/profile/FollowButton";

describe("FollowButton", () => {
  it("shows Follow and calls followUser on click", async () => {
    getUserImpl = async () => ({ data: { user: { id: "viewer" } } });
    render(<FollowButton targetUserId="target" initialFollowing={false} />);
    const btn = await screen.findByRole("button", { name: /^follow$/i });
    await userEvent.click(btn);
    expect(followUser).toHaveBeenCalledWith(expect.anything(), "viewer", "target");
    expect(await screen.findByRole("button", { name: /following/i })).toBeInTheDocument();
  });
  it("shows Following and calls unfollowUser when already following", async () => {
    getUserImpl = async () => ({ data: { user: { id: "viewer" } } });
    render(<FollowButton targetUserId="target" initialFollowing={true} />);
    const btn = await screen.findByRole("button", { name: /following/i });
    await userEvent.click(btn);
    expect(unfollowUser).toHaveBeenCalledWith(expect.anything(), "viewer", "target");
  });

  it("reverts the optimistic flip when followUser rejects", async () => {
    getUserImpl = async () => ({ data: { user: { id: "viewer" } } });
    followUser.mockRejectedValueOnce(new Error("boom"));
    render(<FollowButton targetUserId="target" initialFollowing={false} />);
    const btn = await screen.findByRole("button", { name: /^follow$/i });
    await userEvent.click(btn);
    expect(await screen.findByRole("button", { name: /^follow$/i })).toBeInTheDocument();
  });

  it("renders nothing when there is no signed-in viewer", async () => {
    getUserImpl = async () => ({ data: { user: null } });
    render(<FollowButton targetUserId="target" initialFollowing={false} />);
    await waitFor(() => {
      expect(screen.queryByRole("button")).toBeNull();
    });
  });
});
