import { describe, it, expect, vi, beforeEach } from "vitest";
import { mapMedia, searchMedia, getMediaById } from "@/lib/anilist/media";

const rawMedia = {
  id: 1, type: "ANIME",
  title: { romaji: "Steins;Gate", english: "Steins;Gate", native: null },
  coverImage: { large: "cover.jpg" },
  bannerImage: "banner.jpg",
  description: "A story.",
  genres: ["Sci-Fi", "Thriller"],
  tags: [{ id: 10, name: "Time Travel", rank: 95 }],
  format: "TV", episodes: 24, chapters: null,
  averageScore: 91, popularity: 500000, seasonYear: 2011,
  relations: { edges: [
    { relationType: "SEQUEL",
      node: { id: 2, title: { romaji: "S;G 0", english: null },
              coverImage: { large: "c2.jpg" }, format: "TV" } },
  ] },
};

describe("mapMedia", () => {
  it("maps raw AniList media into the domain shape", () => {
    const m = mapMedia(rawMedia as never);
    expect(m.id).toBe(1);
    expect(m.title).toBe("Steins;Gate");
    expect(m.coverImage).toBe("cover.jpg");
    expect(m.tags[0]).toEqual({ id: 10, name: "Time Travel", rank: 95 });
    expect(m.relations[0].relationType).toBe("SEQUEL");
    expect(m.relations[0].node.id).toBe(2);
  });

  it("prefers english title, falls back to romaji", () => {
    const noEnglish = { ...rawMedia, title: { romaji: "R", english: null, native: null } };
    expect(mapMedia(noEnglish as never).title).toBe("R");
  });
});

describe("searchMedia", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("returns mapped items and pagination", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true, status: 200, headers: { get: () => null },
      json: async () => ({ data: { Page: {
        pageInfo: { hasNextPage: true }, media: [rawMedia],
      } } }),
    } as unknown as Response);
    vi.stubGlobal("fetch", fetchMock);

    const res = await searchMedia({ search: "gate", type: "ANIME" });
    expect(res.items).toHaveLength(1);
    expect(res.items[0].title).toBe("Steins;Gate");
    expect(res.hasNextPage).toBe(true);
  });
});

describe("getMediaById", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("returns null when AniList has no Media", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true, status: 200, headers: { get: () => null },
      json: async () => ({ data: { Media: null } }),
    } as unknown as Response);
    vi.stubGlobal("fetch", fetchMock);

    expect(await getMediaById(999)).toBeNull();
  });
});
