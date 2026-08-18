import { describe, it, expect, beforeEach } from "vitest";
import { bulkUpsert, getEntry, upsertEntry } from "@/lib/list/storage";

describe("bulkUpsert", () => {
  beforeEach(() => localStorage.clear());

  it("inserts many entries in one call", () => {
    bulkUpsert([
      { mediaId: 1, status: "completed", score: 9, progress: 12 },
      { mediaId: 2, status: "watching", score: null, progress: 3 },
    ]);
    expect(getEntry(1)?.score).toBe(9);
    expect(getEntry(2)?.status).toBe("watching");
  });

  it("overwrites existing entries (MAL data wins)", () => {
    upsertEntry(1, { status: "planning", score: 5 });
    bulkUpsert([{ mediaId: 1, status: "completed", score: 10, progress: 24 }]);
    const e = getEntry(1)!;
    expect(e.status).toBe("completed");
    expect(e.score).toBe(10);
    expect(e.progress).toBe(24);
  });

  it("clamps out-of-range scores on import", () => {
    bulkUpsert([{ mediaId: 3, status: "completed", score: 42, progress: -5 }]);
    const e = getEntry(3)!;
    expect(e.score).toBe(10);
    expect(e.progress).toBe(0);
  });
});
