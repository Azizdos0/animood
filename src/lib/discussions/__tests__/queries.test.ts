import { describe, it, expect, vi } from "vitest";
import {
  listThreads, getThread, createThread, getThreadPosts, createPost, deletePost, deleteThread,
} from "@/lib/discussions/queries";

describe("listThreads", () => {
  it("maps an rpc row and coerces reply_count", async () => {
    const rpc = vi.fn(async () => ({
      data: [{
        id: "t1", media_id: 5, user_id: "u1", title: "Hi", created_at: "t", last_activity_at: "t",
        reply_count: 3, username: "friend", display_name: "Friend", avatar_url: null,
      }],
      error: null,
    }));
    const supabase = { rpc } as never;
    const rows = await listThreads(supabase, 5);
    expect(rpc).toHaveBeenCalledWith("get_media_threads", { p_media_id: 5, p_limit: 100 });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: "t1", mediaId: 5, userId: "u1", replyCount: 3, username: "friend" });
    expect(typeof rows[0].replyCount).toBe("number");
  });

  it("drops rows with no username", async () => {
    const supabase = {
      rpc: async () => ({
        data: [
          { id: "t1", media_id: 5, user_id: "u1", title: "Hi", created_at: "t", last_activity_at: "t",
            reply_count: 1, username: "friend", display_name: null, avatar_url: null },
          { id: "t2", media_id: 5, user_id: "u2", title: "Bye", created_at: "t", last_activity_at: "t",
            reply_count: 0, username: null, display_name: null, avatar_url: null },
        ],
        error: null,
      }),
    } as never;
    const rows = await listThreads(supabase, 5);
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe("t1");
  });

  it("throws on rpc error", async () => {
    const supabase = { rpc: async () => ({ data: null, error: { message: "boom" } }) } as never;
    await expect(listThreads(supabase, 5)).rejects.toBeTruthy();
  });
});

describe("getThread", () => {
  it("returns the first row including body", async () => {
    const supabase = {
      rpc: async () => ({
        data: [{ id: "t1", media_id: 5, user_id: "u1", title: "Hi", body: "full body",
          created_at: "t", last_activity_at: "t", reply_count: 2,
          username: "friend", display_name: "Friend", avatar_url: null }],
        error: null,
      }),
    } as never;
    const thread = await getThread(supabase, "t1");
    expect(thread).toMatchObject({ id: "t1", body: "full body", replyCount: 2 });
  });

  it("returns null on empty result", async () => {
    const supabase = { rpc: async () => ({ data: [], error: null }) } as never;
    expect(await getThread(supabase, "missing")).toBeNull();
  });
});

describe("createThread", () => {
  it("rejects an empty title before inserting", async () => {
    const from = vi.fn();
    expect(await createThread({ from } as never, "u1", 5, "  ", "body")).toEqual({ ok: false, error: "empty" });
    expect(from).not.toHaveBeenCalled();
  });

  it("rejects an empty body before inserting", async () => {
    const from = vi.fn();
    expect(await createThread({ from } as never, "u1", 5, "Title", "   ")).toEqual({ ok: false, error: "empty" });
    expect(from).not.toHaveBeenCalled();
  });

  it("rejects a too-long title before inserting", async () => {
    const from = vi.fn();
    expect(await createThread({ from } as never, "u1", 5, "x".repeat(201), "body")).toEqual({ ok: false, error: "too_long" });
    expect(from).not.toHaveBeenCalled();
  });

  it("rejects a too-long body before inserting", async () => {
    const from = vi.fn();
    expect(await createThread({ from } as never, "u1", 5, "Title", "x".repeat(5001))).toEqual({ ok: false, error: "too_long" });
    expect(from).not.toHaveBeenCalled();
  });

  it("returns the new id on success", async () => {
    const single = async () => ({ data: { id: "new" }, error: null });
    const insert = vi.fn(() => ({ select: () => ({ single }) }));
    const supabase = { from: () => ({ insert }) } as never;
    expect(await createThread(supabase, "u1", 5, "Title", "Body")).toEqual({ ok: true, id: "new" });
    expect(insert).toHaveBeenCalledWith({ user_id: "u1", media_id: 5, title: "Title", body: "Body" });
  });

  it("maps an insert failure to unknown", async () => {
    const supabase = {
      from: () => ({ insert: () => ({ select: () => ({ single: async () => ({ data: null, error: { message: "x" } }) }) }) }),
    } as never;
    expect(await createThread(supabase, "u1", 5, "Title", "Body")).toEqual({ ok: false, error: "unknown" });
  });
});

describe("getThreadPosts", () => {
  it("maps rows and drops no-username rows", async () => {
    const supabase = {
      rpc: async () => ({
        data: [
          { id: "p1", thread_id: "t1", user_id: "u1", parent_post_id: null, body: "hi",
            is_deleted: false, created_at: "t", username: "friend", display_name: null, avatar_url: null },
          { id: "p2", thread_id: "t1", user_id: "u2", parent_post_id: "p1", body: "bye",
            is_deleted: false, created_at: "t", username: "", display_name: null, avatar_url: null },
        ],
        error: null,
      }),
    } as never;
    const posts = await getThreadPosts(supabase, "t1");
    expect(posts).toHaveLength(1);
    expect(posts[0]).toMatchObject({ id: "p1", threadId: "t1", parentPostId: null });
  });
});

describe("createPost", () => {
  it("rejects an empty body before inserting", async () => {
    const from = vi.fn();
    expect(await createPost({ from } as never, "u1", "t1", null, "   ")).toEqual({ ok: false, error: "empty" });
    expect(from).not.toHaveBeenCalled();
  });

  it("rejects a too-long body before inserting", async () => {
    const from = vi.fn();
    expect(await createPost({ from } as never, "u1", "t1", null, "x".repeat(5001))).toEqual({ ok: false, error: "too_long" });
    expect(from).not.toHaveBeenCalled();
  });

  it("inserts a trimmed body and returns ok", async () => {
    const insert = vi.fn(async () => ({ error: null }));
    const supabase = { from: () => ({ insert }) } as never;
    expect(await createPost(supabase, "u1", "t1", "p1", "  hello  ")).toEqual({ ok: true });
    expect(insert).toHaveBeenCalledWith({ user_id: "u1", thread_id: "t1", parent_post_id: "p1", body: "hello" });
  });

  it("maps an insert failure to unknown", async () => {
    const supabase = { from: () => ({ insert: async () => ({ error: { message: "x" } }) }) } as never;
    expect(await createPost(supabase, "u1", "t1", null, "hello")).toEqual({ ok: false, error: "unknown" });
  });
});

describe("deletePost", () => {
  it("calls the soft_delete_post rpc", async () => {
    const rpc = vi.fn(async () => ({ error: null }));
    await deletePost({ rpc } as never, "p1");
    expect(rpc).toHaveBeenCalledWith("soft_delete_post", { p_post_id: "p1" });
  });

  it("throws on error", async () => {
    const supabase = { rpc: async () => ({ error: { message: "x" } }) } as never;
    await expect(deletePost(supabase, "p1")).rejects.toBeTruthy();
  });
});

describe("deleteThread", () => {
  it("deletes by id", async () => {
    const eq = vi.fn(async () => ({ error: null }));
    const supabase = { from: () => ({ delete: () => ({ eq }) }) } as never;
    await expect(deleteThread(supabase, "t1")).resolves.toBeUndefined();
    expect(eq).toHaveBeenCalledWith("id", "t1");
  });

  it("throws on error", async () => {
    const supabase = { from: () => ({ delete: () => ({ eq: async () => ({ error: { message: "x" } }) }) }) } as never;
    await expect(deleteThread(supabase, "t1")).rejects.toBeTruthy();
  });
});
