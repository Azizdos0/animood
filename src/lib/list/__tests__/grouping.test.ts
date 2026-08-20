import { describe, it, expect } from "vitest";
import { groupIdsByStatus } from "@/lib/list/grouping";
import type { ListStoreV1 } from "@/lib/list/schema";

const store: ListStoreV1 = {
  version: 1,
  entries: {
    1: { status: "watching", score: null, progress: 1, updatedAt: "", isFavorite: false },
    2: { status: "completed", score: 9, progress: 12, updatedAt: "", isFavorite: false },
    3: { status: "watching", score: 7, progress: 3, updatedAt: "", isFavorite: false },
  },
};

describe("groupIdsByStatus", () => {
  it("buckets ids by status", () => {
    const grouped = groupIdsByStatus(store);
    expect(grouped.watching.sort()).toEqual([1, 3]);
    expect(grouped.completed).toEqual([2]);
    expect(grouped.planning).toEqual([]);
  });
});
