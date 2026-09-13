import { describe, it, expect, vi, beforeEach } from "vitest";
import { COWBOY_BEBOP_FULL, REC_ITEM } from "./fixtures/jikan";

// --- Mocks -----------------------------------------------------------------
// Keep the real JikanError so `instanceof` checks in media.ts hold.
vi.mock("@/lib/anilist/jikan", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/anilist/jikan")>();
  return { ...actual, jikanRequest: vi.fn() };
});
vi.mock("@/lib/anilist/cache", () => ({
  readCache: vi.fn(),
  writeCache: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/supabase/server", () => ({
  supabaseServer: vi.fn().mockResolvedValue({}),
}));

import { jikanRequest, JikanError } from "@/lib/anilist/jikan";
import { readCache, writeCache } from "@/lib/anilist/cache";
import {
  getMediaById,
  getMediaByIds,
  searchMedia,
  getTrending,
  getRecommendationsFor,
  getMediaByMalIds,
} from "@/lib/anilist/media";
import type { Media } from "@/lib/anilist/types";

const jikanMock = vi.mocked(jikanRequest);
const readCacheMock = vi.mocked(readCache);
const writeCacheMock = vi.mocked(writeCache);

function cached(id: number): Media {
  return {
    id,
    type: "ANIME",
    title: `Cached ${id}`,
    coverImage: null,
    bannerImage: null,
    description: null,
    genres: [],
    tags: [],
    format: null,
    episodes: null,
    chapters: null,
    averageScore: null,
    popularity: 0,
    seasonYear: null,
    relations: [],
  };
}

const anime = (id: number) => ({ ...COWBOY_BEBOP_FULL, mal_id: id, title: `Anime ${id}`, title_english: null });

beforeEach(() => {
  vi.clearAllMocks();
  readCacheMock.mockResolvedValue([]);
  writeCacheMock.mockResolvedValue(undefined);
});

describe("getMediaById", () => {
  it("returns a cache hit without calling Jikan", async () => {
    readCacheMock.mockResolvedValue([cached(1)]);
    const m = await getMediaById(1);
    expect(m?.id).toBe(1);
    expect(jikanMock).not.toHaveBeenCalled();
  });

  it("fetches, maps and writes cache on a miss", async () => {
    readCacheMock.mockResolvedValue([]);
    jikanMock.mockResolvedValue({ data: anime(42) });
    const m = await getMediaById(42);
    expect(jikanMock).toHaveBeenCalledWith("/anime/42/full");
    expect(m?.id).toBe(42);
    expect(m?.title).toBe("Anime 42");
    expect(writeCacheMock).toHaveBeenCalledWith([expect.objectContaining({ id: 42 })]);
  });

  it("returns null on JikanError", async () => {
    readCacheMock.mockResolvedValue([]);
    jikanMock.mockRejectedValue(new JikanError("not found", 404));
    expect(await getMediaById(999)).toBeNull();
  });

  it("falls back to live Jikan when the cache read throws", async () => {
    readCacheMock.mockRejectedValue(new Error("cache down"));
    jikanMock.mockResolvedValue({ data: anime(7) });
    const m = await getMediaById(7);
    expect(m?.id).toBe(7);
    expect(jikanMock).toHaveBeenCalledWith("/anime/7/full");
  });
});

describe("getMediaByIds", () => {
  it("returns [] for empty input without touching cache or Jikan", async () => {
    const res = await getMediaByIds([]);
    expect(res).toEqual([]);
    expect(readCacheMock).not.toHaveBeenCalled();
    expect(jikanMock).not.toHaveBeenCalled();
  });

  it("returns cache hits WITHOUT calling Jikan when everything is cached", async () => {
    readCacheMock.mockResolvedValue([cached(1), cached(2)]);
    const res = await getMediaByIds([1, 2]);
    expect(res.map((m) => m.id).sort()).toEqual([1, 2]);
    expect(jikanMock).not.toHaveBeenCalled();
  });

  it("fetches + writes cache for misses, merged with hits", async () => {
    readCacheMock.mockResolvedValue([cached(1)]);
    jikanMock.mockResolvedValue({ data: anime(2) });
    const res = await getMediaByIds([1, 2]);
    expect(jikanMock).toHaveBeenCalledWith("/anime/2/full");
    expect(jikanMock).toHaveBeenCalledTimes(1);
    expect(res.map((m) => m.id).sort()).toEqual([1, 2]);
    expect(writeCacheMock).toHaveBeenCalledWith([expect.objectContaining({ id: 2 })]);
  });

  it("tolerates a throwing miss and returns the rest", async () => {
    readCacheMock.mockResolvedValue([]);
    jikanMock.mockImplementation((path: string) => {
      if (path === "/anime/2/full") return Promise.reject(new JikanError("boom", 500));
      return Promise.resolve({ data: anime(1) }) as never;
    });
    const res = await getMediaByIds([1, 2]);
    expect(res.map((m) => m.id)).toEqual([1]);
  });

  it("caps cold-cache backfill fan-out at MAX_BACKFILL (24)", async () => {
    readCacheMock.mockResolvedValue([]);
    jikanMock.mockImplementation((path: string) => {
      const id = Number(path.split("/")[2]);
      return Promise.resolve({ data: anime(id) }) as never;
    });
    const ids = Array.from({ length: 100 }, (_, i) => i + 1);
    const res = await getMediaByIds(ids);
    expect(jikanMock).toHaveBeenCalledTimes(24);
    expect(res).toHaveLength(24);
  });
});

describe("searchMedia", () => {
  it("returns empty for MANGA without calling Jikan", async () => {
    const res = await searchMedia({ type: "MANGA" });
    expect(res).toEqual({ items: [], hasNextPage: false });
    expect(jikanMock).not.toHaveBeenCalled();
  });

  it("maps items and returns hasNextPage from pagination for ANIME", async () => {
    jikanMock.mockResolvedValue({ data: [anime(1)], pagination: { has_next_page: true } });
    const res = await searchMedia({ type: "ANIME", search: "gate" });
    expect(res.items).toHaveLength(1);
    expect(res.items[0].id).toBe(1);
    expect(res.hasNextPage).toBe(true);
    // List endpoints omit `relations`; must NOT warm the cache.
    expect(writeCacheMock).not.toHaveBeenCalled();
    const path = jikanMock.mock.calls[0][0] as string;
    expect(path).toContain("q=gate");
  });

  it("translates a known genre name to its Jikan id", async () => {
    jikanMock.mockResolvedValue({ data: [], pagination: { has_next_page: false } });
    await searchMedia({ type: "ANIME", genre: "Action" });
    const path = jikanMock.mock.calls[0][0] as string;
    expect(path).toContain("genres=1");
  });

  it("forwards a mapped format to Jikan type=", async () => {
    jikanMock.mockResolvedValue({ data: [], pagination: { has_next_page: false } });
    await searchMedia({ type: "ANIME", format: "MOVIE" });
    const path = jikanMock.mock.calls[0][0] as string;
    expect(path).toContain("type=movie");
  });

  it("omits type= when no format is given", async () => {
    jikanMock.mockResolvedValue({ data: [], pagination: { has_next_page: false } });
    await searchMedia({ type: "ANIME" });
    const path = jikanMock.mock.calls[0][0] as string;
    expect(path).not.toContain("type=");
  });

  it("omits type= for a format with no anime mapping (MANGA)", async () => {
    jikanMock.mockResolvedValue({ data: [], pagination: { has_next_page: false } });
    await searchMedia({ type: "ANIME", format: "MANGA" });
    const path = jikanMock.mock.calls[0][0] as string;
    expect(path).not.toContain("type=");
  });

  it("maps SCORE_DESC sort to order_by=score&sort=desc", async () => {
    jikanMock.mockResolvedValue({ data: [], pagination: { has_next_page: false } });
    await searchMedia({ type: "ANIME", sort: "SCORE_DESC" });
    const path = jikanMock.mock.calls[0][0] as string;
    expect(path).toContain("order_by=score");
    expect(path).toContain("sort=desc");
  });
});

describe("getTrending", () => {
  it("returns [] for MANGA", async () => {
    expect(await getTrending("MANGA")).toEqual([]);
    expect(jikanMock).not.toHaveBeenCalled();
  });

  it("fetches top anime by popularity and maps", async () => {
    jikanMock.mockResolvedValue({ data: [anime(1), anime(2)] });
    const res = await getTrending("ANIME", 5);
    expect(jikanMock).toHaveBeenCalledWith("/top/anime?filter=bypopularity&limit=5");
    expect(res.map((m) => m.id)).toEqual([1, 2]);
    // List endpoints omit `relations`; must NOT warm the cache.
    expect(writeCacheMock).not.toHaveBeenCalled();
  });
});

describe("getRecommendationsFor", () => {
  it("maps recommendation entries", async () => {
    jikanMock.mockResolvedValue({ data: [REC_ITEM] });
    const recs = await getRecommendationsFor(1);
    expect(jikanMock).toHaveBeenCalledWith("/anime/1/recommendations");
    expect(recs).toHaveLength(1);
    expect(recs[0]).toEqual({
      mediaId: 5,
      rating: 42,
      media: { id: 5, title: "CB Movie", coverImage: "r.jpg", format: null },
    });
  });

  it("slices to perPage", async () => {
    jikanMock.mockResolvedValue({ data: [REC_ITEM, REC_ITEM, REC_ITEM] });
    const recs = await getRecommendationsFor(1, 2);
    expect(recs).toHaveLength(2);
  });

  it("returns [] on failure", async () => {
    jikanMock.mockRejectedValue(new JikanError("boom", 500));
    expect(await getRecommendationsFor(1)).toEqual([]);
  });
});

describe("getMediaByMalIds", () => {
  it("returns [] for MANGA", async () => {
    expect(await getMediaByMalIds([1, 2], "MANGA")).toEqual([]);
    expect(jikanMock).not.toHaveBeenCalled();
  });

  it("returns [] for empty input", async () => {
    expect(await getMediaByMalIds([], "ANIME")).toEqual([]);
  });

  it("maps to MalMediaStub using canonical MAL ids", async () => {
    readCacheMock.mockResolvedValue([]);
    jikanMock.mockImplementation((path: string) => {
      const id = Number(path.split("/")[2]);
      return Promise.resolve({ data: anime(id) }) as never;
    });
    const stubs = await getMediaByMalIds([21], "ANIME");
    expect(stubs).toEqual([
      { id: 21, idMal: 21, title: "Anime 21", coverImage: "lg.jpg", format: "TV" },
    ]);
  });
});
