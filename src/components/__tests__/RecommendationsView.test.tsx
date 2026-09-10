import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { act } from "react";
import { render, waitFor, screen, fireEvent, within } from "@testing-library/react";
import { RecommendationsView, buildListKey } from "@/components/RecommendationsView";
import { setEntry, setListAccount, __resetListCacheForTests } from "@/lib/list/reactive";

describe("RecommendationsView", () => {
  it("ignores an old account's response after switching accounts", async () => {
    let finishOld!: (value: unknown) => void;
    const fetchMock = vi.fn().mockImplementationOnce(() => new Promise(resolve => { finishOld = resolve; }))
      .mockResolvedValue({ ok: true, json: async () => ({ pool: [], profile: null }) });
    vi.stubGlobal("fetch", fetchMock);
    setListAccount("account-a");
    render(<RecommendationsView moodId="calm" mediaType="MANGA" />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({ mood: "calm", type: "MANGA" });
    act(() => setListAccount("account-b"));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    await screen.findByText("No picks fit this combination yet.");
    await act(async () => finishOld({ ok: true, json: async () => ({ pool: [{ media: { id: 1, title: "Old account pick", genres: ["Slice of Life"], tags: [], relations: [] }, base: 5, contributions: [] }], profile: null }) }));
    expect(screen.queryByRole("link", { name: "Old account pick" })).toBeNull();
    expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(true);
  });

  it("offers mood choices and favorites onboarding for an empty list", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ pool: [], profile: null, coldStart: true }) }));
    render(<RecommendationsView />);
    expect(screen.getByRole("link", { name: /soft & slow/i })).toHaveAttribute("href", expect.stringContaining("mood=calm"));
    expect(screen.getByRole("button", { name: /pick 3 favorites/i })).toBeInTheDocument();
    await waitFor(() => expect(fetch).toHaveBeenCalled());
  });

  it("remembers Not for me after remount and replaces the hidden card", async () => {
    const pool = [1, 2, 3].map(id => ({ media: { id, title: `Pick ${id}`, type: "ANIME", genres: ["Action"], tags: [], relations: [],
      coverImage: null, bannerImage: null, episodes: 12, format: "TV" }, base: 5 - id, contributions: [] }));
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ pool, profile: null, coldStart: false }) }));
    const first = render(<RecommendationsView />);
    const title = await screen.findByRole("link", { name: "Pick 1" });
    fireEvent.click(within(title.closest("article")!).getByRole("button", { name: /not for me/i }));
    expect(screen.queryByRole("link", { name: "Pick 1" })).toBeNull();
    first.unmount();
    render(<RecommendationsView />);
    await screen.findByRole("link", { name: "Pick 2" });
    expect(screen.queryByRole("link", { name: "Pick 1" })).toBeNull();
    expect(screen.queryByText(/% MATCH/)).toBeNull();
  });
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
