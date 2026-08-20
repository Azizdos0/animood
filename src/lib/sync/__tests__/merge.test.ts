import { describe, it, expect } from "vitest";
import { mergeLists, rowToEntry, entryToRow, type CloudRow } from "@/lib/sync/merge";
import type { ListStoreV1 } from "@/lib/list/schema";

const store = (entries: ListStoreV1["entries"]): ListStoreV1 => ({ version: 1, entries });
const row = (media_id: number, updated_at: string, over: Partial<CloudRow> = {}): CloudRow => ({
  user_id: "u1", media_id, status: "watching", score: null, progress: 0, updated_at, is_favorite: false, ...over,
});

describe("row mappers", () => {
  it("round-trips a row through entry and back", () => {
    const r = row(5, "2026-01-01T00:00:00.000Z", { status: "completed", score: 9, progress: 12 });
    const { mediaId, entry } = rowToEntry(r);
    expect(mediaId).toBe(5);
    expect(entry).toEqual({ status: "completed", score: 9, progress: 12, updatedAt: r.updated_at, isFavorite: false });
    expect(entryToRow("u1", mediaId, entry)).toEqual(r);
  });

  it("round-trips isFavorite through the row mappers", () => {
    const row = entryToRow("u1", 7, {
      status: "watching", score: null, progress: 3, updatedAt: "2026-01-01T00:00:00Z", isFavorite: true,
    });
    expect(row.is_favorite).toBe(true);
    expect(rowToEntry(row).entry.isFavorite).toBe(true);
  });

  it("defaults isFavorite to false when the row omits it", () => {
    const { entry } = rowToEntry({
      user_id: "u1", media_id: 7, status: "watching", score: null, progress: 3,
      updated_at: "2026-01-01T00:00:00Z",
    } as never);
    expect(entry.isFavorite).toBe(false);
  });
});

describe("mergeLists", () => {
  it("keeps ids present on only one side (union, never drops)", () => {
    const local = store({ 1: { status: "watching", score: null, progress: 3, updatedAt: "2026-01-01T00:00:00.000Z", isFavorite: false } });
    const cloud = [row(2, "2026-01-01T00:00:00.000Z", { status: "planning" })];
    const merged = mergeLists(local, cloud);
    expect(Object.keys(merged.entries).sort()).toEqual(["1", "2"]);
  });

  it("keeps the newer entry when an id is on both sides", () => {
    const local = store({ 1: { status: "watching", score: 5, progress: 3, updatedAt: "2026-01-02T00:00:00.000Z", isFavorite: false } });
    const cloud = [row(1, "2026-01-01T00:00:00.000Z", { status: "completed", score: 10, progress: 12 })];
    const merged = mergeLists(local, cloud);
    expect(merged.entries[1].score).toBe(5); // local is newer
  });

  it("prefers cloud when cloud is newer", () => {
    const local = store({ 1: { status: "watching", score: 5, progress: 3, updatedAt: "2026-01-01T00:00:00.000Z", isFavorite: false } });
    const cloud = [row(1, "2026-01-03T00:00:00.000Z", { status: "completed", score: 10, progress: 12 })];
    const merged = mergeLists(local, cloud);
    expect(merged.entries[1].score).toBe(10);
  });

  it("compares instants numerically across serializations (offset-form cloud wins)", () => {
    // Cloud comes back in PostgREST offset form; local is the JS toISOString Z form.
    const local = store({ 1: { status: "watching", score: 5, progress: 3, updatedAt: "2026-01-02T00:00:00.000Z", isFavorite: false } });
    const cloud = [row(1, "2026-01-03T00:00:00+00:00", { status: "completed", score: 10, progress: 12 })];
    const merged = mergeLists(local, cloud);
    expect(merged.entries[1].score).toBe(10); // newer cloud instant wins
  });

  it("does not let a lexicographically-larger offset string beat a later instant", () => {
    // Cloud string "…23:00:00+05:30" sorts after local "…18:00:00.000Z" as raw
    // text, but is the EARLIER instant (17:30Z vs 18:00Z) — local must win.
    const local = store({ 1: { status: "watching", score: 5, progress: 3, updatedAt: "2026-01-02T18:00:00.000Z", isFavorite: false } });
    const cloud = [row(1, "2026-01-02T23:00:00+05:30", { status: "completed", score: 10, progress: 12 })];
    const merged = mergeLists(local, cloud);
    expect(merged.entries[1].score).toBe(5); // later local instant wins
  });

  it("handles empty local and empty cloud", () => {
    expect(Object.keys(mergeLists(store({}), []).entries)).toHaveLength(0);
    const cloud = [row(9, "2026-01-01T00:00:00.000Z")];
    expect(Object.keys(mergeLists(store({}), cloud).entries)).toEqual(["9"]);
  });
});
