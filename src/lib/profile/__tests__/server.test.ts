import { describe, it, expect, vi } from "vitest";

// Mock the Supabase server client + queries the loader uses.
const profile = {
  userId: "u1",
  username: "aziz",
  displayName: "Aziz",
  avatarUrl: null,
  isPublic: true,
  createdAt: "2026-08-20T00:00:00.000Z",
};
vi.mock("@/lib/supabase/server", () => ({
  supabaseServer: async () => ({ auth: { getUser: async () => ({ data: { user: currentUser } }) } }),
}));
vi.mock("@/lib/profile/queries", () => ({ getProfileCard: async () => currentProfile }));
vi.mock("@/lib/sync/cloud", () => ({
  pullCloud: async () => [
    { user_id: "u1", media_id: 1, status: "completed", score: 9, progress: 12, updated_at: "2026-01-01T00:00:00Z", is_favorite: true },
  ],
}));
vi.mock("@/lib/follow/queries", () => ({
  getFollowCounts: vi.fn(async () => currentFollowCounts),
  isFollowing: vi.fn(async () => currentIsFollowing),
}));

// Mutable holder so individual tests can vary what getProfileByUsername resolves.
let currentProfile: typeof profile | null = profile;
let currentUser: { id: string } | null = null;
let currentFollowCounts = { followers: 0, following: 0 };
let currentIsFollowing = false;

import { loadProfilePage } from "@/lib/profile/server";

describe("loadProfilePage", () => {
  it("returns ok state with mapped entries for a public profile", async () => {
    currentProfile = profile;
    currentUser = null;
    currentFollowCounts = { followers: 0, following: 0 };
    currentIsFollowing = false;
    const res = await loadProfilePage("aziz");
    expect(res.state).toBe("ok");
    if (res.state === "ok") {
      expect(res.isOwner).toBe(false);
      expect(res.entries[1].isFavorite).toBe(true);
      expect(res.followCounts).toEqual({ followers: 0, following: 0 });
      expect(res.viewerFollows).toBe(false);
    }
  });

  it("returns not_found when the profile does not exist", async () => {
    currentProfile = null;
    const res = await loadProfilePage("ghost");
    expect(res.state).toBe("not_found");
  });

  it("returns private when the profile is private and viewer is not the owner", async () => {
    currentProfile = { ...profile, isPublic: false };
    currentUser = null;
    currentFollowCounts = { followers: 0, following: 0 };
    currentIsFollowing = false;
    const res = await loadProfilePage("aziz");
    expect(res.state).toBe("private");
    if (res.state === "private") {
      expect(res.isOwner).toBe(false);
      expect(res.profile.isPublic).toBe(false);
      expect(res.followCounts).toEqual({ followers: 0, following: 0 });
      expect(res.viewerFollows).toBe(false);
    }
  });

  it("includes follow counts and viewerFollows on the ok state", async () => {
    currentProfile = profile;
    currentUser = { id: "u2" };
    currentFollowCounts = { followers: 2, following: 1 };
    currentIsFollowing = false;
    const res = await loadProfilePage("aziz");
    expect(res.state).toBe("ok");
    if (res.state === "ok") {
      expect(res.followCounts).toEqual({ followers: 2, following: 1 });
      expect(res.viewerFollows).toBe(false);
    }
  });

  it("does not mark viewerFollows true for the owner even if isFollowing would resolve true", async () => {
    currentProfile = profile;
    currentUser = { id: "u1" };
    currentFollowCounts = { followers: 2, following: 1 };
    currentIsFollowing = true;
    const res = await loadProfilePage("aziz");
    expect(res.state).toBe("ok");
    if (res.state === "ok") {
      expect(res.isOwner).toBe(true);
      expect(res.viewerFollows).toBe(false);
    }
  });

  it("degrades gracefully when follow reads throw", async () => {
    currentProfile = profile;
    currentUser = { id: "u2" };
    const { getFollowCounts, isFollowing } = await import("@/lib/follow/queries");
    vi.mocked(getFollowCounts).mockRejectedValueOnce(new Error("boom"));
    vi.mocked(isFollowing).mockRejectedValueOnce(new Error("boom"));
    const res = await loadProfilePage("aziz");
    expect(res.state).toBe("ok");
    if (res.state === "ok") {
      expect(res.followCounts).toEqual({ followers: 0, following: 0 });
      expect(res.viewerFollows).toBe(false);
    }
  });
});
