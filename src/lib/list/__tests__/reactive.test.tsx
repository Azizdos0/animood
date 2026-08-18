import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import {
  useListStore, useListEntry, setEntry, deleteEntry, __resetListCacheForTests,
} from "@/lib/list/reactive";

describe("reactive list store", () => {
  beforeEach(() => {
    localStorage.clear();
    __resetListCacheForTests();
  });

  it("useListEntry returns null when the title is not on the list", () => {
    const { result } = renderHook(() => useListEntry(5));
    expect(result.current).toBeNull();
  });

  it("setEntry updates subscribers and persists", () => {
    const { result } = renderHook(() => useListEntry(5));
    act(() => setEntry(5, { status: "watching", score: 8, progress: 3 }));
    expect(result.current?.status).toBe("watching");
    expect(result.current?.score).toBe(8);
    expect(localStorage.getItem("animood.list.v1")).toContain("watching");
  });

  it("deleteEntry removes the entry and notifies", () => {
    const { result } = renderHook(() => useListEntry(5));
    act(() => setEntry(5, { status: "planning" }));
    expect(result.current).not.toBeNull();
    act(() => deleteEntry(5));
    expect(result.current).toBeNull();
  });

  it("useListStore exposes all entries reactively", () => {
    const { result } = renderHook(() => useListStore());
    act(() => setEntry(7, { status: "completed", score: 9, progress: 12 }));
    expect(Object.keys(result.current.entries)).toContain("7");
  });
});
