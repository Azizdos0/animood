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
  supabaseServer: async () => ({ auth: { getUser: async () => ({ data: { user: null } }) } }),
}));
vi.mock("@/lib/profile/queries", () => ({ getProfileCard: async () => currentProfile }));
vi.mock("@/lib/sync/cloud", () => ({
  pullCloud: async () => [
    { user_id: "u1", media_id: 1, status: "completed", score: 9, progress: 12, updated_at: "2026-01-01T00:00:00Z", is_favorite: true },
  ],
}));

// Mutable holder so individual tests can vary what getProfileByUsername resolves.
let currentProfile: typeof profile | null = profile;

import { loadProfilePage } from "@/lib/profile/server";

describe("loadProfilePage", () => {
  it("returns ok state with mapped entries for a public profile", async () => {
    currentProfile = profile;
    const res = await loadProfilePage("aziz");
    expect(res.state).toBe("ok");
    if (res.state === "ok") {
      expect(res.isOwner).toBe(false);
      expect(res.entries[1].isFavorite).toBe(true);
    }
  });

  it("returns not_found when the profile does not exist", async () => {
    currentProfile = null;
    const res = await loadProfilePage("ghost");
    expect(res.state).toBe("not_found");
  });

  it("returns private when the profile is private and viewer is not the owner", async () => {
    currentProfile = { ...profile, isPublic: false };
    const res = await loadProfilePage("aziz");
    expect(res.state).toBe("private");
    if (res.state === "private") {
      expect(res.isOwner).toBe(false);
      expect(res.profile.isPublic).toBe(false);
    }
  });
});
