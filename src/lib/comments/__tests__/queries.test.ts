import { describe, it, expect, vi } from "vitest";
import { listComments, addComment, deleteComment } from "@/lib/comments/queries";

describe("listComments", () => {
  it("maps flat rows returned by the get_media_comments RPC", async () => {
    const rows = [
      { id: "c1", media_id: 5, user_id: "u1", body: "hi", created_at: "2026-02-01T00:00:00Z",
        username: "friend", display_name: "Friend", avatar_url: null },
    ];
    const rpc = vi.fn(async () => ({ data: rows, error: null }));
    const supabase = { rpc } as never;
    const items = await listComments(supabase, 5);
    expect(rpc).toHaveBeenCalledWith("get_media_comments", { p_media_id: 5, p_limit: 100 });
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      id: "c1", mediaId: 5, userId: "u1", username: "friend",
      displayName: "Friend", avatarUrl: null, body: "hi", createdAt: "2026-02-01T00:00:00Z",
    });
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
