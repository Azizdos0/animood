import { describe, it, expect, vi, beforeEach } from "vitest";
import { getMediaByIds } from "@/lib/anilist/media";

const raw = (id: number) => ({
  id, type: "ANIME", title: { romaji: `T${id}`, english: null, native: null },
  coverImage: { large: `c${id}.jpg` }, bannerImage: null, description: null,
  genres: [], tags: [], format: "TV", episodes: 12, chapters: null,
  averageScore: 70, popularity: 100, seasonYear: 2020, relations: { edges: [] },
});

describe("getMediaByIds", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("returns empty array for empty input without calling fetch", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect(await getMediaByIds([])).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("maps returned media", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true, status: 200, headers: { get: () => null },
      json: async () => ({ data: { Page: { media: [raw(1), raw(2)] } } }),
    } as unknown as Response);
    vi.stubGlobal("fetch", fetchMock);

    const items = await getMediaByIds([1, 2]);
    expect(items.map((m) => m.id).sort()).toEqual([1, 2]);
    expect(items[0].title).toMatch(/^T/);
  });

  it("chunks ids into batches of 50", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true, status: 200, headers: { get: () => null },
      json: async () => ({ data: { Page: { media: [] } } }),
    } as unknown as Response);
    vi.stubGlobal("fetch", fetchMock);

    await getMediaByIds(Array.from({ length: 120 }, (_, i) => i + 1));
    expect(fetchMock).toHaveBeenCalledTimes(3); // 50 + 50 + 20
  });
});
