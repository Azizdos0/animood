import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Media } from "@/lib/anilist/types";
import { AiringSchedule } from "@/components/schedule/AiringSchedule";
import { setEntry, __resetListCacheForTests } from "@/lib/list/reactive";

const NOW = new Date(2026, 8, 28, 10, 0).getTime(); // Mon 28 Sep 2026, 10:00 local
const at = (dayOffset: number, h: number) => new Date(2026, 8, 28 + dayOffset, h).getTime() / 1000;
const media = (id: number, title: string, airingAt: number, episode: number): Media => ({
  id, type: "ANIME", title, coverImage: null, bannerImage: null, description: null, genres: [], tags: [],
  format: "TV", episodes: 12, chapters: null, averageScore: 80, popularity: 1000, seasonYear: 2026, relations: [],
  status: "RELEASING", nextAiringEpisode: { episode, airingAt },
});
const popularShow = media(1, "Popular Show", at(1, 20), 4);   // tomorrow
const myShow = media(2, "My Show", at(0, 18), 5);             // today, ep 5 → eps 1–4 out

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  localStorage.clear();
  __resetListCacheForTests();
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

function stubMedia(items: Media[]) {
  const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ items }) });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("AiringSchedule", () => {
  it("defaults to the viewer's shows, with countdowns and episodes to catch up", async () => {
    setEntry(2, { status: "watching", progress: 2 });
    const fetchMock = stubMedia([myShow]);
    render(<AiringSchedule popular={[popularShow]} failed={false} />);

    await waitFor(() => expect(screen.getByText("My Show")).toBeInTheDocument());
    expect(fetchMock).toHaveBeenCalledWith("/api/media?ids=2", expect.anything());
    expect(screen.getByRole("button", { name: "My shows · 1" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByText("Popular Show")).not.toBeInTheDocument();
    const today = screen.getByRole("region", { name: /Today/ });
    expect(within(today).getByText("in 8h")).toBeInTheDocument();
    expect(within(today).getByText("EP 5 / 12")).toBeInTheDocument();
    expect(within(today).getByText("2 to catch up")).toBeInTheDocument();
  });

  it("shows everything airing when toggled, marking the viewer's shows", async () => {
    setEntry(2, { status: "planning" });
    stubMedia([myShow]);
    render(<AiringSchedule popular={[popularShow]} failed={false} />);
    await waitFor(() => expect(screen.getByText("My Show")).toBeInTheDocument());
    expect(screen.queryByText(/to catch up/)).not.toBeInTheDocument(); // planning, not watching

    await userEvent.setup({ advanceTimers: vi.advanceTimersByTime }).click(screen.getByRole("button", { name: "All airing" }));
    const tomorrow = screen.getByRole("region", { name: /Tomorrow/ });
    expect(within(tomorrow).getByText("Popular Show")).toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: /Today/ })).getByText("On your list")).toBeInTheDocument();
  });

  it("defaults to everything when the viewer follows nothing that airs, without fetching", () => {
    const fetchMock = stubMedia([]);
    render(<AiringSchedule popular={[popularShow]} failed={false} />);
    expect(screen.getByRole("button", { name: "All airing" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("Popular Show")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("explains an empty 'My shows' view and offers everything instead", async () => {
    stubMedia([]);
    render(<AiringSchedule popular={[popularShow]} failed={false} />);
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await user.click(screen.getByRole("button", { name: "My shows · 0" }));
    expect(screen.getByText("None of your shows air this week.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "browse everything airing" }));
    expect(screen.getByText("Popular Show")).toBeInTheDocument();
  });

  it("still shows the viewer's shows when the full schedule failed to load", async () => {
    setEntry(2, { status: "watching", progress: 4 });
    stubMedia([myShow]);
    render(<AiringSchedule popular={[]} failed />);
    await waitFor(() => expect(screen.getByText("My Show")).toBeInTheDocument());
    expect(screen.getByText(/FULL SCHEDULE IS UNAVAILABLE.*SHOWING YOUR SHOWS/)).toBeInTheDocument();
  });
});
