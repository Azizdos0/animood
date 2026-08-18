import { describe, it, expect } from "vitest";
import { emptyStore, isValidStore, CURRENT_LIST_VERSION } from "@/lib/list/schema";

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
});
