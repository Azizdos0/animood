import { describe, it, expect, vi } from "vitest";
const profile = { userId: "u1", username: "aziz", displayName: "Aziz", avatarUrl: null, isPublic: true, createdAt: "2026-08-20T00:00:00Z" };
const privateProfile = { ...profile, username: "priv", isPublic: false };

let currentUserId: string | null = null;

vi.mock("@/lib/supabase/server", () => ({
  supabaseServer: async () => ({
    auth: { getUser: async () => ({ data: { user: currentUserId ? { id: currentUserId } : null } }) },
  }),
}));
vi.mock("@/lib/profile/queries", () => ({
  getProfileCard: async (_s: unknown, u: string) => {
    if (u === "aziz") return profile;
    if (u === "priv") return privateProfile;
    return null;
  },
}));

const getFollowers = vi.fn(async () => [{ username: "f1", displayName: null, avatarUrl: null }]);
const getFollowing = vi.fn(async () => [{ username: "g1", displayName: null, avatarUrl: null }]);
vi.mock("@/lib/discover/queries", () => ({
  getFollowers: (...args: unknown[]) => getFollowers(...(args as [])),
  getFollowing: (...args: unknown[]) => getFollowing(...(args as [])),
}));

import { loadFollowList } from "@/lib/discover/server";

describe("loadFollowList", () => {
  it("returns not_found for an unknown username", async () => {
    currentUserId = null;
    expect(await loadFollowList("nope", "followers")).toEqual({ state: "not_found" });
  });

  it("returns followers for the profile", async () => {
    currentUserId = null;
    const res = await loadFollowList("aziz", "followers");
    expect(res.state).toBe("ok");
    if (res.state === "ok") expect(res.users[0].username).toBe("f1");
  });

  it("returns following for the profile", async () => {
    currentUserId = null;
    const res = await loadFollowList("aziz", "following");
    if (res.state === "ok") expect(res.users[0].username).toBe("g1");
  });

  it("returns private state for a private profile viewed by a non-owner, without fetching the list", async () => {
    currentUserId = "someone-else";
    getFollowers.mockClear();
    getFollowing.mockClear();
    const res = await loadFollowList("priv", "followers");
    expect(res.state).toBe("private");
    if (res.state === "private") expect(res.profile.username).toBe("priv");
    expect(getFollowers).not.toHaveBeenCalled();
    expect(getFollowing).not.toHaveBeenCalled();
  });

  it("returns private state for a private profile viewed while logged out", async () => {
    currentUserId = null;
    const res = await loadFollowList("priv", "following");
    expect(res.state).toBe("private");
  });

  it("returns ok for the owner viewing their own private profile", async () => {
    currentUserId = "u1";
    const res = await loadFollowList("priv", "followers");
    expect(res.state).toBe("ok");
    if (res.state === "ok") expect(res.users[0].username).toBe("f1");
  });
});
