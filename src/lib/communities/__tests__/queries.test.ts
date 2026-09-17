import { describe, it, expect, vi } from "vitest";
import {
  listCommunities, getCommunityBySlug, getMembers, getMyRole, listBans, listCommunityThreads,
  createCommunity, joinCommunity, leaveCommunity, deleteCommunity, setMemberRole,
  banMember, unbanMember, setThreadPinned, moderateRemovePost, moderateDeleteThread,
  createCommunityThread, createCommunityPost,
} from "@/lib/communities/queries";

describe("listCommunities", () => {
  it("maps rows and orders by member_count via the query builder", async () => {
    const rows = [{ id: "c1", slug: "isekai", name: "Isekai", description: "", member_count: 3, created_by: "u1", created_at: "t" }];
    const builder = {
      select: () => builder, or: () => builder, order: () => builder,
      limit: async () => ({ data: rows, error: null }),
    };
    const supabase = { from: () => builder } as never;
    const out = await listCommunities(supabase);
    expect(out[0]).toMatchObject({ id: "c1", slug: "isekai", memberCount: 3 });
  });

  it("returns [] for a search under 2 chars without hitting or()", async () => {
    const or = vi.fn();
    const builder = {
      select: () => builder, or, order: () => builder,
      limit: async () => ({ data: [], error: null }),
    };
    const supabase = { from: () => builder } as never;
    const out = await listCommunities(supabase, "a");
    expect(out).toEqual([]);
    expect(or).not.toHaveBeenCalled();
  });

  it("throws on error", async () => {
    const builder = {
      select: () => builder, or: () => builder, order: () => builder,
      limit: async () => ({ data: null, error: { message: "boom" } }),
    };
    const supabase = { from: () => builder } as never;
    await expect(listCommunities(supabase)).rejects.toBeTruthy();
  });
});

describe("getCommunityBySlug", () => {
  it("returns null when no row", async () => {
    const builder = { select: () => builder, eq: () => builder, limit: async () => ({ data: [], error: null }) };
    const supabase = { from: () => builder } as never;
    expect(await getCommunityBySlug(supabase, "missing")).toBeNull();
  });

  it("returns the mapped community when found", async () => {
    const rows = [{ id: "c1", slug: "isekai", name: "Isekai", description: "d", member_count: 1, created_by: "u1", created_at: "t" }];
    const builder = { select: () => builder, eq: () => builder, limit: async () => ({ data: rows, error: null }) };
    const supabase = { from: () => builder } as never;
    expect(await getCommunityBySlug(supabase, "isekai")).toMatchObject({ id: "c1", slug: "isekai" });
  });
});

describe("getMembers", () => {
  it("maps rows and drops no-username rows", async () => {
    const supabase = {
      rpc: async () => ({
        data: [
          { user_id: "u1", role: "owner", username: "friend", display_name: null, avatar_url: null },
          { user_id: "u2", role: "member", username: "", display_name: null, avatar_url: null },
        ],
        error: null,
      }),
    } as never;
    const members = await getMembers(supabase, "c1");
    expect(members).toHaveLength(1);
    expect(members[0]).toMatchObject({ userId: "u1", role: "owner" });
  });
});

describe("getMyRole", () => {
  it("returns null when no row", async () => {
    const builder = { select: () => builder, eq: () => builder, limit: async () => ({ data: [], error: null }) };
    const supabase = { from: () => builder } as never;
    expect(await getMyRole(supabase, "c1", "u1")).toBeNull();
  });

  it("returns the role", async () => {
    const builder = { select: () => builder, eq: () => builder, limit: async () => ({ data: [{ role: "moderator" }], error: null }) };
    const supabase = { from: () => builder } as never;
    expect(await getMyRole(supabase, "c1", "u1")).toBe("moderator");
  });
});

describe("listCommunityThreads", () => {
  it("maps rows including community_id and is_pinned", async () => {
    const supabase = {
      rpc: async () => ({
        data: [{
          id: "t1", user_id: "u1", title: "T", created_at: "t", last_activity_at: "t",
          reply_count: 2, username: "friend", display_name: null, avatar_url: null,
          community_id: "c1", is_pinned: true,
        }],
        error: null,
      }),
    } as never;
    const rows = await listCommunityThreads(supabase, "c1");
    expect(rows[0]).toMatchObject({ id: "t1", communityId: "c1", isPinned: true, replyCount: 2 });
  });
});

describe("createCommunity", () => {
  it("returns the new id on success", async () => {
    const supabase = { rpc: async () => ({ data: "c1", error: null }) } as never;
    expect(await createCommunity(supabase, "isekai", "Isekai", "d")).toEqual({ ok: true, id: "c1" });
  });

  it("maps a duplicate slug error", async () => {
    const supabase = { rpc: async () => ({ error: { message: 'duplicate key value violates unique constraint "communities_slug_key"' } }) } as never;
    expect(await createCommunity(supabase, "isekai", "Isekai", "d")).toEqual({ ok: false, error: "slug_taken" });
  });

  it("maps a check violation to invalid", async () => {
    const supabase = { rpc: async () => ({ error: { message: "new row violates check constraint" } }) } as never;
    expect(await createCommunity(supabase, "isekai", "Isekai", "d")).toEqual({ ok: false, error: "invalid" });
  });

  it("maps an unrecognized error to unknown", async () => {
    const supabase = { rpc: async () => ({ error: { message: "something else" } }) } as never;
    expect(await createCommunity(supabase, "isekai", "Isekai", "d")).toEqual({ ok: false, error: "unknown" });
  });
});

describe("joinCommunity", () => {
  it("maps a banned rpc error", async () => {
    const supabase = { rpc: async () => ({ error: { message: "banned" } }) } as never;
    expect(await joinCommunity(supabase, "c1")).toEqual({ ok: false, error: "banned" });
  });
  it("returns ok on success", async () => {
    const supabase = { rpc: async () => ({ error: null }) } as never;
    expect(await joinCommunity(supabase, "c1")).toEqual({ ok: true });
  });
});

describe("leaveCommunity/deleteCommunity/setMemberRole/banMember/unbanMember/setThreadPinned/moderateRemovePost/moderateDeleteThread", () => {
  it("call the expected rpc with args and return ok", async () => {
    const rpc = vi.fn(async () => ({ error: null }));
    const supabase = { rpc } as never;
    expect(await leaveCommunity(supabase, "c1")).toEqual({ ok: true });
    expect(rpc).toHaveBeenCalledWith("leave_community", { p_community_id: "c1" });

    expect(await deleteCommunity(supabase, "c1")).toEqual({ ok: true });
    expect(rpc).toHaveBeenCalledWith("delete_community", { p_community_id: "c1" });

    expect(await setMemberRole(supabase, "c1", "u2", "moderator")).toEqual({ ok: true });
    expect(rpc).toHaveBeenCalledWith("set_member_role", { p_community_id: "c1", p_target: "u2", p_role: "moderator" });

    expect(await banMember(supabase, "c1", "u2")).toEqual({ ok: true });
    expect(rpc).toHaveBeenCalledWith("ban_member", { p_community_id: "c1", p_target: "u2" });

    expect(await unbanMember(supabase, "c1", "u2")).toEqual({ ok: true });
    expect(rpc).toHaveBeenCalledWith("unban_member", { p_community_id: "c1", p_target: "u2" });

    expect(await setThreadPinned(supabase, "t1", true)).toEqual({ ok: true });
    expect(rpc).toHaveBeenCalledWith("set_thread_pinned", { p_thread_id: "t1", p_pinned: true });

    expect(await moderateRemovePost(supabase, "p1")).toEqual({ ok: true });
    expect(rpc).toHaveBeenCalledWith("moderate_remove_post", { p_post_id: "p1" });

    expect(await moderateDeleteThread(supabase, "t1")).toEqual({ ok: true });
    expect(rpc).toHaveBeenCalledWith("moderate_delete_thread", { p_thread_id: "t1" });
  });
});

describe("createCommunityThread", () => {
  it("returns the new id", async () => {
    const supabase = { rpc: async () => ({ data: "t1", error: null }) } as never;
    expect(await createCommunityThread(supabase, "c1", "T", "B")).toEqual({ ok: true, id: "t1" });
  });

  it("maps an rpc error", async () => {
    const supabase = { rpc: async () => ({ error: { message: "boom" } }) } as never;
    expect(await createCommunityThread(supabase, "c1", "T", "B")).toEqual({ ok: false, error: "boom" });
  });
});

describe("createCommunityPost", () => {
  it("returns ok on success", async () => {
    const rpc = vi.fn(async () => ({ error: null }));
    const supabase = { rpc } as never;
    expect(await createCommunityPost(supabase, "t1", null, "hi")).toEqual({ ok: true });
    expect(rpc).toHaveBeenCalledWith("create_community_post", { p_thread_id: "t1", p_parent_post_id: null, p_body: "hi" });
  });
});

describe("listBans", () => {
  it("calls get_community_bans and maps rows snake→camel, dropping rows without a username", async () => {
    const rpc = vi.fn(async () => ({
      data: [
        { user_id: "u-ban", banned_by: "u-owner", created_at: "t", username: "banned1", display_name: "Ban One", avatar_url: null },
        { user_id: "u-x", banned_by: null, created_at: "t", username: null, display_name: null, avatar_url: null },
      ],
      error: null,
    }));
    const supabase = { rpc } as never;
    const bans = await listBans(supabase, "c1");
    expect(rpc).toHaveBeenCalledWith("get_community_bans", { p_community_id: "c1" });
    expect(bans).toEqual([
      { userId: "u-ban", bannedBy: "u-owner", createdAt: "t", username: "banned1", displayName: "Ban One", avatarUrl: null },
    ]);
  });

  it("throws on rpc error", async () => {
    const supabase = { rpc: async () => ({ data: null, error: { message: "boom" } }) } as never;
    await expect(listBans(supabase, "c1")).rejects.toBeTruthy();
  });
});
