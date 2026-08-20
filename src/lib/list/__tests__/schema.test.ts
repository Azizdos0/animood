import { describe, it, expect } from "vitest";
import {
  emptyStore, isValidStore, sanitizeStore, CURRENT_LIST_VERSION,
} from "@/lib/list/schema";

describe("list schema", () => {
  it("emptyStore has the current version and no entries", () => {
    const s = emptyStore();
    expect(s.version).toBe(CURRENT_LIST_VERSION);
    expect(s.entries).toEqual({});
  });

  it("accepts a well-formed store", () => {
    const good = { version: 1, entries: {
      5: { status: "completed", score: 9, progress: 24, updatedAt: "2026-01-01T00:00:00.000Z" },
    } };
    expect(isValidStore(good)).toBe(true);
  });

  it("rejects a wrong version", () => {
    expect(isValidStore({ version: 2, entries: {} })).toBe(false);
  });

  it("rejects an entry with an invalid status", () => {
    const bad = { version: 1, entries: {
      5: { status: "watchinggg", score: 9, progress: 0, updatedAt: "x" },
    } };
    expect(isValidStore(bad)).toBe(false);
  });

  it("rejects an out-of-range score", () => {
    const bad = { version: 1, entries: {
      5: { status: "completed", score: 42, progress: 0, updatedAt: "x" },
    } };
    expect(isValidStore(bad)).toBe(false);
  });

  it("rejects non-object input", () => {
    expect(isValidStore(null)).toBe(false);
    expect(isValidStore("nope")).toBe(false);
  });

  it("rejects NaN/Infinity score and progress", () => {
    const nanScore = { version: 1, entries: {
      5: { status: "completed", score: NaN, progress: 0, updatedAt: "x" },
    } };
    const infProgress = { version: 1, entries: {
      5: { status: "completed", score: 9, progress: Infinity, updatedAt: "x" },
    } };
    expect(isValidStore(nanScore)).toBe(false);
    expect(isValidStore(infProgress)).toBe(false);
  });

  it("rejects non-integer score and progress", () => {
    const fractionalScore = { version: 1, entries: {
      5: { status: "completed", score: 7.5, progress: 0, updatedAt: "x" },
    } };
    const fractionalProgress = { version: 1, entries: {
      5: { status: "completed", score: 7, progress: 2.5, updatedAt: "x" },
    } };
    expect(isValidStore(fractionalScore)).toBe(false);
    expect(isValidStore(fractionalProgress)).toBe(false);
  });

  it("rejects non-numeric entry keys", () => {
    const bad = { version: 1, entries: {
      abc: { status: "completed", score: 9, progress: 0, updatedAt: "x" },
    } };
    expect(isValidStore(bad)).toBe(false);
  });

  describe("sanitizeStore", () => {
    it("keeps only valid entries and drops invalid ones", () => {
      const mixed = {
        version: 1,
        entries: {
          1: { status: "watching", score: 7, progress: 3, updatedAt: "2026-01-01T00:00:00.000Z" },
          2: { status: "bogus-status", score: 7, progress: 3, updatedAt: "2026-01-01T00:00:00.000Z" },
        },
      };
      const sanitized = sanitizeStore(mixed);
      expect(sanitized.entries[1]).toBeDefined();
      expect(sanitized.entries[2]).toBeUndefined();
    });

    it("falls back to an empty store when the top-level shape is unusable", () => {
      expect(sanitizeStore(null)).toEqual(emptyStore());
      expect(sanitizeStore({ version: 99, entries: {} })).toEqual(emptyStore());
    });

    it("drops entries with non-numeric keys", () => {
      const value = { version: 1, entries: {
        abc: { status: "watching", score: 5, progress: 0, updatedAt: "x" },
      } };
      expect(sanitizeStore(value).entries).toEqual({});
    });

    it("defaults isFavorite to false when absent (back-compat)", () => {
      const store = sanitizeStore({
        version: 1,
        entries: { 5: { status: "completed", score: 9, progress: 12, updatedAt: "2026-01-01T00:00:00Z" } },
      });
      expect(store.entries[5].isFavorite).toBe(false);
    });

    it("preserves isFavorite=true", () => {
      const store = sanitizeStore({
        version: 1,
        entries: { 5: { status: "completed", score: 9, progress: 12, updatedAt: "2026-01-01T00:00:00Z", isFavorite: true } },
      });
      expect(store.entries[5].isFavorite).toBe(true);
    });
  });
});
