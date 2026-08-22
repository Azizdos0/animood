import { describe, it, expect, vi } from "vitest";
import { followUser, unfollowUser, isFollowing, getFollowCounts } from "@/lib/follow/queries";

function fakeFrom(handlers: Record<string, unknown>) {
  return { from: () => handlers } as never;
}

describe("followUser", () => {
  it("treats a 23505 unique-violation as success", async () => {
    const q = { insert: async () => ({ error: { code: "23505" } }) };
    await expect(followUser(fakeFrom(q), "a", "b")).resolves.toBeUndefined();
  });
  it("throws on other errors", async () => {
    const q = { insert: async () => ({ error: { code: "500", message: "x" } }) };
    await expect(followUser(fakeFrom(q), "a", "b")).rejects.toBeTruthy();
  });
});

describe("unfollowUser", () => {
  it("deletes the follower/following pair", async () => {
    const eq2 = vi.fn(async () => ({ error: null }));
    const q = { delete: () => ({ eq: () => ({ eq: eq2 }) }) };
    await expect(unfollowUser(fakeFrom(q), "a", "b")).resolves.toBeUndefined();
    expect(eq2).toHaveBeenCalled();
  });
});

describe("isFollowing", () => {
  it("returns true when a row exists", async () => {
    const q = { select: () => q, eq: () => q, maybeSingle: async () => ({ data: { follower_id: "a" }, error: null }) } as Record<string, unknown>;
    expect(await isFollowing(fakeFrom(q), "a", "b")).toBe(true);
  });
  it("returns false when no row", async () => {
    const q = { select: () => q, eq: () => q, maybeSingle: async () => ({ data: null, error: null }) } as Record<string, unknown>;
    expect(await isFollowing(fakeFrom(q), "a", "b")).toBe(false);
  });
});

describe("getFollowCounts", () => {
  it("maps the rpc row", async () => {
    const supabase = { rpc: async () => ({ data: [{ followers: 3, following: 5 }], error: null }) } as never;
    expect(await getFollowCounts(supabase, "u1")).toEqual({ followers: 3, following: 5 });
  });
  it("defaults to zero when empty", async () => {
    const supabase = { rpc: async () => ({ data: [], error: null }) } as never;
    expect(await getFollowCounts(supabase, "u1")).toEqual({ followers: 0, following: 0 });
  });
});
