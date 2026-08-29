import { describe, it, expect, vi } from "vitest";
const profile = { userId: "u1", username: "aziz", displayName: "Aziz", avatarUrl: null, isPublic: true, createdAt: "2026-08-20T00:00:00Z" };
vi.mock("@/lib/supabase/server", () => ({ supabaseServer: async () => ({}) }));
vi.mock("@/lib/profile/queries", () => ({ getProfileCard: async (_s: unknown, u: string) => (u === "aziz" ? profile : null) }));
vi.mock("@/lib/discover/queries", () => ({
  getFollowers: async () => [{ username: "f1", displayName: null, avatarUrl: null }],
  getFollowing: async () => [{ username: "g1", displayName: null, avatarUrl: null }],
}));
import { loadFollowList } from "@/lib/discover/server";

describe("loadFollowList", () => {
  it("returns not_found for an unknown username", async () => {
    expect(await loadFollowList("nope", "followers")).toEqual({ state: "not_found" });
  });
  it("returns followers for the profile", async () => {
    const res = await loadFollowList("aziz", "followers");
    expect(res.state).toBe("ok");
    if (res.state === "ok") expect(res.users[0].username).toBe("f1");
  });
  it("returns following for the profile", async () => {
    const res = await loadFollowList("aziz", "following");
    if (res.state === "ok") expect(res.users[0].username).toBe("g1");
  });
});
