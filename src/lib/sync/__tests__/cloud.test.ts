import { describe, it, expect } from "vitest";
import { pullCloud, pushEntries, deleteEntries } from "@/lib/sync/cloud";
import type { ListEntry } from "@/lib/list/schema";

function makeSupa() {
  const calls: {
    upsert: { rows: unknown; opts: unknown }[];
    deleteIn: { col: string; ids: unknown }[];
  } = { upsert: [], deleteIn: [] };
  const api = {
    from: () => api,
    select: () => ({
      eq: async () => ({
        data: [{ user_id: "u1", media_id: 7, status: "watching", score: null, progress: 2, updated_at: "2026-01-01T00:00:00.000Z" }],
        error: null,
      }),
    }),
    upsert: (rows: unknown, opts: unknown) => { calls.upsert.push({ rows, opts }); return { error: null }; },
    delete: () => ({
      eq: () => ({
        in: (col: string, ids: unknown) => { calls.deleteIn.push({ col, ids }); return Promise.resolve({ error: null }); },
      }),
    }),
    _calls: calls,
  };
  return api;
}

const entry = (updatedAt: string, over: Partial<ListEntry> = {}): ListEntry => ({
  status: "watching", score: null, progress: 0, updatedAt, ...over,
});

describe("pullCloud", () => {
  it("returns the user's rows", async () => {
    const supa = makeSupa();
    const rows = await pullCloud(supa as never, "u1");
    expect(rows[0].media_id).toBe(7);
  });
});

describe("pushEntries", () => {
  it("upserts exactly the given rows with the composite onConflict", async () => {
    const supa = makeSupa();
    await pushEntries(supa as never, "u1", [
      { mediaId: 7, entry: entry("2026-02-01T00:00:00.000Z", { status: "completed", score: 8, progress: 12 }) },
      { mediaId: 9, entry: entry("2026-02-02T00:00:00.000Z") },
    ]);
    expect(supa._calls.upsert).toHaveLength(1);
    const { rows, opts } = supa._calls.upsert[0];
    expect(rows).toEqual([
      { user_id: "u1", media_id: 7, status: "completed", score: 8, progress: 12, updated_at: "2026-02-01T00:00:00.000Z" },
      { user_id: "u1", media_id: 9, status: "watching", score: null, progress: 0, updated_at: "2026-02-02T00:00:00.000Z" },
    ]);
    expect(opts).toEqual({ onConflict: "user_id,media_id" });
  });

  it("is a no-op when there are no entries", async () => {
    const supa = makeSupa();
    await pushEntries(supa as never, "u1", []);
    expect(supa._calls.upsert).toHaveLength(0);
  });
});

describe("deleteEntries", () => {
  it("deletes only the given media ids via .in", async () => {
    const supa = makeSupa();
    await deleteEntries(supa as never, "u1", [7, 9]);
    expect(supa._calls.deleteIn).toHaveLength(1);
    expect(supa._calls.deleteIn[0]).toEqual({ col: "media_id", ids: [7, 9] });
  });

  it("is a no-op when there are no ids", async () => {
    const supa = makeSupa();
    await deleteEntries(supa as never, "u1", []);
    expect(supa._calls.deleteIn).toHaveLength(0);
  });
});
