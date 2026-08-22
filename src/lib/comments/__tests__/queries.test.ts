import { describe, it, expect, vi } from "vitest";
import { listComments, addComment, deleteComment } from "@/lib/comments/queries";

describe("listComments", () => {
  it("maps rows with embedded profile and drops profile-less rows", async () => {
    const rows = [
      { id: "c1", media_id: 5, user_id: "u1", body: "hi", created_at: "2026-02-01T00:00:00Z",
        profiles: { username: "friend", display_name: "Friend", avatar_url: null } },
      { id: "c2", media_id: 5, user_id: "u2", body: "orphan", created_at: "2026-01-01T00:00:00Z", profiles: null },
    ];
    const q: Record<string, unknown> = {
      select: () => q, eq: () => q, order: () => q,
      limit: async () => ({ data: rows, error: null }),
    };
    const supabase = { from: () => q } as never;
    const items = await listComments(supabase, 5);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ id: "c1", mediaId: 5, username: "friend", body: "hi" });
  });
});

describe("addComment", () => {
  const noInsert = { from: () => ({ insert: vi.fn() }) } as never;
  it("rejects an empty/whitespace body before inserting", async () => {
    expect(await addComment(noInsert, "u1", 5, "   ")).toEqual({ ok: false, error: "empty" });
  });
  it("rejects an over-long body before inserting", async () => {
    expect(await addComment(noInsert, "u1", 5, "x".repeat(2001))).toEqual({ ok: false, error: "too_long" });
  });
  it("inserts a trimmed body and returns ok", async () => {
    const insert = vi.fn(async () => ({ error: null }));
    const supabase = { from: () => ({ insert }) } as never;
    expect(await addComment(supabase, "u1", 5, "  hello  ")).toEqual({ ok: true });
    expect(insert).toHaveBeenCalledWith({ user_id: "u1", media_id: 5, body: "hello" });
  });
  it("maps an insert failure to unknown", async () => {
    const supabase = { from: () => ({ insert: async () => ({ error: { message: "x" } }) }) } as never;
    expect(await addComment(supabase, "u1", 5, "hello")).toEqual({ ok: false, error: "unknown" });
  });
});

describe("deleteComment", () => {
  it("deletes by id", async () => {
    const eq = vi.fn(async () => ({ error: null }));
    const supabase = { from: () => ({ delete: () => ({ eq }) }) } as never;
    await expect(deleteComment(supabase, "c1")).resolves.toBeUndefined();
    expect(eq).toHaveBeenCalledWith("id", "c1");
  });
});
