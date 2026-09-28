import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import type { Media } from "@/lib/anilist/types";
import { InProgress } from "@/components/home/InProgress";
import { setEntry, __resetListCacheForTests } from "@/lib/list/reactive";

const NOW = new Date(2026, 8, 28, 10, 0).getTime();
const media = (id: number, title: string, next: Media["nextAiringEpisode"]): Media => ({
  id, type: "ANIME", title, coverImage: null, bannerImage: null, description: null, genres: [], tags: [],
  format: "TV", episodes: 12, chapters: null, averageScore: 80, popularity: 1000, seasonYear: 2026, relations: [],
  status: next ? "RELEASING" : "FINISHED", nextAiringEpisode: next,
});

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  localStorage.clear();
  __resetListCacheForTests();
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("InProgress airing info", () => {
  it("shows new episodes to catch up and the next episode countdown linking to the schedule", async () => {
    setEntry(1, { status: "watching", progress: 3 });
    setEntry(2, { status: "watching", progress: 5 });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ items: [
      media(1, "Airing Show", { episode: 6, airingAt: NOW / 1000 + 2 * 86400 + 3600 }),
      media(2, "Finished Show", null),
    ] }) }));
    render(<InProgress />);

    await waitFor(() => expect(screen.getByText("Airing Show")).toBeInTheDocument());
    expect(screen.getByText("2 NEW")).toBeInTheDocument(); // eps 4–5 out, watched to 3
    expect(screen.getByRole("link", { name: "EP 6 IN 2D 1H" })).toHaveAttribute("href", "/schedule");
    expect(screen.getByText("Finished Show")).toBeInTheDocument();
    expect(screen.getAllByText(/NEW|IN \d/)).toHaveLength(2); // nothing extra for the finished show
  });
});
