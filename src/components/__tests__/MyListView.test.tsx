import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MyListView } from "@/components/MyListView";
import { setEntry, __resetListCacheForTests } from "@/lib/list/reactive";

describe("MyListView", () => {
  beforeEach(() => {
    localStorage.clear();
    __resetListCacheForTests();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows a fallback card for an id the API doesn't return, instead of a perpetual skeleton", async () => {
    setEntry(1, { status: "watching" });
    setEntry(2, { status: "watching" });

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ items: [{ id: 1, title: "Only One", coverImage: null }] }),
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<MyListView />);

    await waitFor(() => {
      expect(screen.getByText("Only One")).toBeInTheDocument();
    });

    expect(screen.getByText(/title unavailable/i)).toBeInTheDocument();
    // The fallback still links to the detail page for the missing id.
    const fallbackLink = screen.getByText(/title unavailable/i).closest("a");
    expect(fallbackLink).toHaveAttribute("href", "/media/2");

    // No skeletons should remain once the fetch has settled.
    expect(document.querySelector(".animate-pulse")).toBeNull();
  });

  it("shows a soft error notice when the fetch resolves with a non-ok response (e.g. 502)", async () => {
    setEntry(1, { status: "watching" });

    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 502,
      json: async () => ({ items: [], error: "fetch_failed" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<MyListView />);

    await waitFor(() => {
      expect(
        screen.getByText(/couldn.t load your titles right now/i)
      ).toBeInTheDocument();
    });

    // Should not be stuck showing an indefinite skeleton.
    expect(document.querySelector(".animate-pulse")).toBeNull();
  });
});
