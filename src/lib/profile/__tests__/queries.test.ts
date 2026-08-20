import { describe, it, expect, vi } from "vitest";
import {
  getProfileByUsername, getProfileCard, createProfile, setProfileVisibility,
} from "@/lib/profile/queries";

const ROW = {
  user_id: "u1", username: "aziz", display_name: "Aziz",
  avatar_url: null, is_public: true, created_at: "2026-08-20T00:00:00.000Z",
};

function fakeSupabase(handlers: Record<string, unknown>) {
  return { from: () => handlers } as never;
}

describe("getProfileByUsername", () => {
  it("maps a row to a Profile", async () => {
    const q = {
      select: () => q, eq: () => q,
      maybeSingle: async () => ({ data: ROW, error: null }),
    };
    const profile = await getProfileByUsername(fakeSupabase(q), "Aziz");
    expect(profile).toEqual({
      userId: "u1", username: "aziz", displayName: "Aziz",
      avatarUrl: null, isPublic: true, createdAt: "2026-08-20T00:00:00.000Z",
    });
  });
  it("returns null when not found", async () => {
    const q = {
      select: () => q, eq: () => q,
      maybeSingle: async () => ({ data: null, error: null }),
    };
    expect(await getProfileByUsername(fakeSupabase(q), "nope")).toBeNull();
  });
});

describe("getProfileCard", () => {
  it("maps the first row returned by the RPC to a Profile", async () => {
    const supabase = { rpc: async () => ({ data: [ROW], error: null }) } as never;
    const profile = await getProfileCard(supabase, "Aziz");
    expect(profile).toEqual({
      userId: "u1", username: "aziz", displayName: "Aziz",
      avatarUrl: null, isPublic: true, createdAt: "2026-08-20T00:00:00.000Z",
    });
  });
  it("returns null when the RPC returns no rows", async () => {
    const supabase = { rpc: async () => ({ data: [], error: null }) } as never;
    expect(await getProfileCard(supabase, "ghost")).toBeNull();
  });
  it("throws when the RPC errors", async () => {
    const supabase = { rpc: async () => ({ data: null, error: { message: "x" } }) } as never;
    await expect(getProfileCard(supabase, "aziz")).rejects.toBeTruthy();
  });
});

describe("createProfile", () => {
  it("maps a Postgres unique-violation (23505) to 'taken'", async () => {
    const q = {
      insert: () => q, select: () => q,
      maybeSingle: async () => ({ data: null, error: { code: "23505" } }),
    };
    const res = await createProfile(fakeSupabase(q), {
      userId: "u1", username: "taken", displayName: null, avatarUrl: null,
    });
    expect(res).toEqual({ ok: false, error: "taken" });
  });
  it("rejects an invalid username without hitting the DB", async () => {
    const from = vi.fn();
    const res = await createProfile({ from } as never, {
      userId: "u1", username: "!!", displayName: null, avatarUrl: null,
    });
    expect(res).toEqual({ ok: false, error: "invalid" });
    expect(from).not.toHaveBeenCalled();
  });
});

describe("setProfileVisibility", () => {
  it("throws when the update errors", async () => {
    const q = { update: () => q, eq: async () => ({ error: { message: "x" } }) };
    await expect(setProfileVisibility(fakeSupabase(q), "u1", false)).rejects.toBeTruthy();
  });
});
