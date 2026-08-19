import { describe, it, expect, vi } from "vitest";
import { pullCloud, reconcileCloud } from "@/lib/sync/cloud";
import type { ListStoreV1 } from "@/lib/list/schema";

function makeSupa() {
  const calls: Record<string, unknown[]> = { upsert: [], deleteNotIn: [] };
  const api = {
    from: () => api,
    select: () => ({ eq: async () => ({ data: [{ user_id: "u1", media_id: 7, status: "watching", score: null, progress: 2, updated_at: "2026-01-01T00:00:00.000Z" }], error: null }) }),
    upsert: (rows: unknown) => { calls.upsert.push(rows); return { error: null }; },
    delete: () => ({
      eq: () => ({
        not: (col: string, op: string, val: unknown) => { calls.deleteNotIn.push([col, op, val]); return Promise.resolve({ error: null }); },
        // when the store is empty we delete all rows for the user (eq only)
        then: (res: (v: { error: null }) => void) => res({ error: null }),
      }),
    }),
    _calls: calls,
  };
  return api;
}

describe("pullCloud", () => {
  it("returns the user's rows", async () => {
    const supa = makeSupa();
    const rows = await pullCloud(supa as never, "u1");
    expect(rows[0].media_id).toBe(7);
  });
});

describe("reconcileCloud", () => {
  it("upserts current entries and deletes rows not in the store", async () => {
    const supa = makeSupa();
    const store: ListStoreV1 = { version: 1, entries: {
      7: { status: "completed", score: 8, progress: 12, updatedAt: "2026-02-01T00:00:00.000Z" },
    } };
    await reconcileCloud(supa as never, "u1", store);
    expect((supa._calls.upsert[0] as unknown[]).length).toBe(1);
    // deletes rows whose media_id is not in [7]
    expect(supa._calls.deleteNotIn[0]).toEqual(["media_id", "in", "(7)"]);
  });
});
