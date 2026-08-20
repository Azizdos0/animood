import { describe, it, expect, beforeEach } from "vitest";
import { replaceStore, loadStore } from "@/lib/list/storage";
import type { ListStoreV1 } from "@/lib/list/schema";

describe("replaceStore", () => {
  beforeEach(() => localStorage.clear());

  it("replaces the whole store and preserves updatedAt", () => {
    const store: ListStoreV1 = { version: 1, entries: {
      5: { status: "completed", score: 9, progress: 12, updatedAt: "2026-01-01T00:00:00.000Z" },
    } };
    replaceStore(store);
    expect(loadStore().entries[5].updatedAt).toBe("2026-01-01T00:00:00.000Z");
  });

  it("drops invalid entries and clamps out-of-range values", () => {
    const store = { version: 1, entries: {
      1: { status: "watching", score: 42, progress: -5, updatedAt: "2026-01-01T00:00:00.000Z" },
      2: { status: "bogus", score: 5, progress: 1, updatedAt: "2026-01-01T00:00:00.000Z" },
    } } as unknown as ListStoreV1;
    replaceStore(store);
    const out = loadStore();
    expect(out.entries[1].score).toBe(10);
    expect(out.entries[1].progress).toBe(0);
    expect(out.entries[2]).toBeUndefined(); // invalid status dropped
  });
});
