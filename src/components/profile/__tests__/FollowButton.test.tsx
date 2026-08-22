import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
const followUser = vi.fn(async (..._a: unknown[]) => {});
const unfollowUser = vi.fn(async (..._a: unknown[]) => {});
vi.mock("@/lib/follow/queries", () => ({
  followUser: (...a: unknown[]) => followUser(...a),
  unfollowUser: (...a: unknown[]) => unfollowUser(...a),
}));
vi.mock("@/lib/supabase/client", () => ({
  supabaseBrowser: () => ({ auth: { getUser: async () => ({ data: { user: { id: "viewer" } } }) } }),
}));
import { FollowButton } from "@/components/profile/FollowButton";

describe("FollowButton", () => {
  it("shows Follow and calls followUser on click", async () => {
    render(<FollowButton targetUserId="target" initialFollowing={false} />);
    const btn = screen.getByRole("button", { name: /^follow$/i });
    await userEvent.click(btn);
    expect(followUser).toHaveBeenCalledWith(expect.anything(), "viewer", "target");
    expect(await screen.findByRole("button", { name: /following/i })).toBeInTheDocument();
  });
  it("shows Following and calls unfollowUser when already following", async () => {
    render(<FollowButton targetUserId="target" initialFollowing={true} />);
    await userEvent.click(screen.getByRole("button", { name: /following/i }));
    expect(unfollowUser).toHaveBeenCalledWith(expect.anything(), "viewer", "target");
  });

  it("reverts the optimistic flip when followUser rejects", async () => {
    followUser.mockRejectedValueOnce(new Error("boom"));
    render(<FollowButton targetUserId="target" initialFollowing={false} />);
    const btn = screen.getByRole("button", { name: /^follow$/i });
    await userEvent.click(btn);
    expect(await screen.findByRole("button", { name: /^follow$/i })).toBeInTheDocument();
  });
});
