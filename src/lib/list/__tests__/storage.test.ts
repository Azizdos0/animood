import {
  describe, it, expect, beforeEach, afterEach, vi,
} from "vitest";
import {
  LIST_STORAGE_KEY, loadStore, getEntry, upsertEntry, removeEntry, clearAll,
} from "@/lib/list/storage";

describe("list storage", () => {
  beforeEach(() => {
    // Clear localStorage by removing each key individually
    const keys = Object.keys(localStorage);
    for (let i = 0; i < keys.length; i++) {
      localStorage.removeItem(keys[i]);
    }
  });

  it("loadStore returns an empty store when nothing is saved", () => {
    expect(loadStore().entries).toEqual({});
  });

  it("loadStore returns an empty store when saved data is corrupt", () => {
    localStorage.setItem(LIST_STORAGE_KEY, "{ not json");
    expect(loadStore().entries).toEqual({});
  });

  it("loadStore discards data that fails validation", () => {
    localStorage.setItem(LIST_STORAGE_KEY, JSON.stringify({ version: 99, entries: {} }));
    expect(loadStore().version).toBe(1);
  });

  it("upsertEntry creates then updates an entry and stamps updatedAt", () => {
    upsertEntry(5, { status: "watching", score: null, progress: 3 });
    let e = getEntry(5)!;
    expect(e.status).toBe("watching");
    expect(e.progress).toBe(3);
    expect(typeof e.updatedAt).toBe("string");

    upsertEntry(5, { status: "completed", score: 9 });
    e = getEntry(5)!;
    expect(e.status).toBe("completed");
    expect(e.score).toBe(9);
    expect(e.progress).toBe(3); // preserved
  });

  it("removeEntry deletes an entry", () => {
    upsertEntry(5, { status: "planning" });
    expect(getEntry(5)).not.toBeNull();
    removeEntry(5);
    expect(getEntry(5)).toBeNull();
  });

  it("clearAll empties the store", () => {
    upsertEntry(5, { status: "planning" });
    clearAll();
    expect(loadStore().entries).toEqual({});
  });

  it("persists across a fresh load", () => {
    upsertEntry(7, { status: "completed", score: 8, progress: 12 });
    expect(loadStore().entries[7].score).toBe(8);
  });

  describe("write robustness", () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("upsertEntry does not throw when localStorage.setItem throws", () => {
      const spy = vi
        .spyOn(Object.getPrototypeOf(window.localStorage) as Storage, "setItem")
        .mockImplementation(() => {
          throw new DOMException("The quota has been exceeded.", "QuotaExceededError");
        });

      expect(() => upsertEntry(5, { status: "watching", score: 5, progress: 1 })).not.toThrow();

      spy.mockRestore();
    });

    it("upsertEntry with an out-of-range score persists a clamped value", () => {
      upsertEntry(9, { status: "watching", score: 11, progress: 3 });
      const e = getEntry(9)!;
      expect(e.score).toBe(10);
    });

    it("upsertEntry with a negative progress persists a floored value", () => {
      upsertEntry(10, { status: "watching", score: null, progress: -5 });
      const e = getEntry(10)!;
      expect(e.progress).toBe(0);
    });
  });

  it("loadStore keeps valid entries and drops only the invalid ones", () => {
    localStorage.setItem(
      LIST_STORAGE_KEY,
      JSON.stringify({
        version: 1,
        entries: {
          1: { status: "watching", score: 7, progress: 3, updatedAt: "2026-01-01T00:00:00.000Z" },
          2: { status: "bogus-status", score: 7, progress: 3, updatedAt: "2026-01-01T00:00:00.000Z" },
        },
      })
    );
    const store = loadStore();
    expect(store.entries[1]).toBeDefined();
    expect(store.entries[1].score).toBe(7);
    expect(store.entries[2]).toBeUndefined();
  });
});
