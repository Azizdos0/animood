import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { act } from "react";
import { render, waitFor } from "@testing-library/react";
import { RecommendationsView, buildListKey } from "@/components/RecommendationsView";
import { setEntry, __resetListCacheForTests } from "@/lib/list/reactive";

describe("RecommendationsView", () => {
  beforeEach(() => {
    localStorage.clear();
    __resetListCacheForTests();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("refetches recommendations when an existing entry's score changes", async () => {
    setEntry(1, { status: "completed", score: 5 });

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ pool: [], profile: null, coldStart: false }),
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<RecommendationsView />);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    act(() => {
      setEntry(1, { score: 9 });
    });

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    // The refetch should carry the updated score in the POST body.
    const secondCallBody = JSON.parse(fetchMock.mock.calls[1][1].body as string);
    expect(secondCallBody.list).toEqual([{ id: 1, score: 9, status: "completed" }]);
  });

  it("refetches when only the status changes (score unchanged)", async () => {
    setEntry(2, { status: "watching", score: 7 });

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ pool: [], profile: null, coldStart: false }),
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<RecommendationsView />);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    act(() => {
      setEntry(2, { status: "dropped" });
    });

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });
  });

  it("buildListKey (pure helper) changes when score or status changes, not just membership", () => {
    const base = { 1: { status: "completed" as const, score: 5, progress: 12, updatedAt: "t", isFavorite: false } };
    const rescored = { 1: { status: "completed" as const, score: 9, progress: 12, updatedAt: "t", isFavorite: false } };
    const restatused = { 1: { status: "dropped" as const, score: 5, progress: 12, updatedAt: "t", isFavorite: false } };

    expect(buildListKey(base)).not.toBe(buildListKey(rescored));
    expect(buildListKey(base)).not.toBe(buildListKey(restatused));
    // Same score/status -> same key, regardless of unrelated fields.
    expect(buildListKey(base)).toBe(
      buildListKey({ 1: { status: "completed", score: 5, progress: 999, updatedAt: "other", isFavorite: false } })
    );
  });
});
