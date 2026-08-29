import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { ProfileHeader } from "@/components/profile/ProfileHeader";

const profile = {
  userId: "u1", username: "aziz", displayName: "Aziz", avatarUrl: null,
  isPublic: true, createdAt: "2026-08-20T00:00:00.000Z",
};

describe("ProfileHeader", () => {
  it("renders the handle and follower placeholders", () => {
    render(<ProfileHeader profile={profile} isOwner={false} followCounts={{ followers: 0, following: 0 }} />);
    expect(screen.getByText("@aziz")).toBeInTheDocument();
    expect(screen.getByText(/0 followers/i)).toBeInTheDocument();
  });

  it("renders real follow counts as links to the followers and following lists", () => {
    render(<ProfileHeader profile={profile} isOwner={false} followCounts={{ followers: 12, following: 3 }} />);
    const followersLink = screen.getByRole("link", { name: /12 followers/i });
    expect(followersLink).toHaveAttribute("href", "/u/aziz/followers");
    const followingLink = screen.getByRole("link", { name: /3 following/i });
    expect(followingLink).toHaveAttribute("href", "/u/aziz/following");
  });
});
