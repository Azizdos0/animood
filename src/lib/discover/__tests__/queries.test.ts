import { describe, it, expect, vi } from "vitest";
import { sanitizeTerm, searchUsers, getFollowers, getFollowing } from "@/lib/discover/queries";

describe("sanitizeTerm", () => {
  it("strips PostgREST-significant and wildcard chars", () => {
    expect(sanitizeTerm("  a%b,c()d*  ")).toBe("abcd");
  });
  it("keeps letters, digits, space, underscore, hyphen", () => {
    expect(sanitizeTerm("Aziz_01 dos-2")).toBe("Aziz_01 dos-2");
  });
});

describe("searchUsers", () => {
  it("returns [] for a term under 2 chars without querying", async () => {
    const from = vi.fn();
    expect(await searchUsers({ from } as never, "a")).toEqual([]);
    expect(from).not.toHaveBeenCalled();
  });
  it("maps matching profiles and passes a sanitized or() filter", async () => {
    const or = vi.fn(() => q);
    const q: Record<string, unknown> = {
      select: () => q, or, order: () => q,
      limit: async () => ({ data: [{ username: "aziz", display_name: "Aziz", avatar_url: null }], error: null }),
    };
    const users = await searchUsers({ from: () => q } as never, "az%iz");
    expect(users).toEqual([{ username: "aziz", displayName: "Aziz", avatarUrl: null }]);
    expect(or).toHaveBeenCalledWith("username.ilike.%aziz%,display_name.ilike.%aziz%");
  });
});

describe("getFollowers", () => {
  it("does the two-step ids -> profiles and maps results", async () => {
    const followsQ = { select: () => followsQ, eq: async () => ({ data: [{ follower_id: "u2" }], error: null }) };
    const profilesQ: Record<string, unknown> = {
      select: () => profilesQ, in: () => profilesQ,
      limit: async () => ({ data: [{ username: "friend", display_name: null, avatar_url: null }], error: null }),
    };
    const supabase = { from: (t: string) => (t === "follows" ? followsQ : profilesQ) } as never;
    const users = await getFollowers(supabase, "u1");
    expect(users).toEqual([{ username: "friend", displayName: null, avatarUrl: null }]);
  });
  it("returns [] when there are no follower ids", async () => {
    const followsQ = { select: () => followsQ, eq: async () => ({ data: [], error: null }) };
    const supabase = { from: () => followsQ } as never;
    expect(await getFollowers(supabase, "u1")).toEqual([]);
  });
});

describe("getFollowing", () => {
  it("filters follows by follower_id", async () => {
    const eq = vi.fn(async () => ({ data: [], error: null }));
    const followsQ = { select: () => followsQ, eq };
    const supabase = { from: () => followsQ } as never;
    await getFollowing(supabase, "u1");
    expect(eq).toHaveBeenCalledWith("follower_id", "u1");
  });
});
