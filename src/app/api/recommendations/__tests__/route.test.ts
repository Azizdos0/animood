import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "@/app/api/recommendations/route";
import * as media from "@/lib/anilist/media";
import type { Media, MediaTag } from "@/lib/anilist/types";

function m(id: number, tags: [number, string, number][]): Media {
  return {
    id, type: "ANIME", title: `T${id}`, coverImage: null, bannerImage: null,
    description: null, genres: [], format: "TV", episodes: 12, chapters: null,
    averageScore: 75, popularity: 20000, seasonYear: 2020, relations: [],
    tags: tags.map(([tid, name, rank]) => ({ id: tid, name, rank } as MediaTag)),
  };
}
const req = (body: unknown) =>
  new Request("http://x/api/recommendations", { method: "POST", body: JSON.stringify(body) });

describe("/api/recommendations", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("returns coldStart when no scored titles", async () => {
    const res = await POST(req({ list: [{ id: 1, score: null, status: "planning" }] }));
    expect(await res.json()).toEqual({ profile: null, pool: [], coldStart: true });
  });

  it("returns a scored pool for a rated list", async () => {
    vi.spyOn(media, "getMediaByIds").mockImplementation(async (ids: number[]) =>
      ids.map((id) => m(id, [[10, "Time Loop", 100]]))
    );
    vi.spyOn(media, "getRecommendationsFor").mockResolvedValue([
      { mediaId: 99, rating: 50, media: { id: 99, title: "R", coverImage: null, format: "TV" } },
    ]);
    const res = await POST(req({ list: [{ id: 1, score: 9, status: "completed" }] }));
    const body = await res.json();
    expect(body.coldStart).toBe(false);
    expect(body.pool.some((c: { media: { id: number } }) => c.media.id === 99)).toBe(true);
  });

  it("bases the source-signal mean on the fetched `rated` set, not the raw list, when a media fetch misses", async () => {
    // id 3's media fetch "misses" (e.g. deleted/unavailable on AniList) — the
    // rated basis is only {1: 9, 2: 9}, mean 9. The raw list basis would be
    // {1: 9, 2: 9, 3: 1}, mean ~6.33. Those means disagree on the sign of the
    // source signal for score-9 sources (0 vs +2.67), which flips whether the
    // community boost for a shared recommendation is zero or positive.
    vi.spyOn(media, "getMediaByIds").mockImplementation(async (ids: number[]) => {
      if (ids.length === 3 && ids.includes(3)) {
        return ids.filter((id) => id !== 3).map((id) => m(id, [[10, "Tag", 100]]));
      }
      return ids.map((id) => m(id, [[10, "Tag", 100]]));
    });
    vi.spyOn(media, "getRecommendationsFor").mockResolvedValue([
      { mediaId: 99, rating: 50, media: { id: 99, title: "R", coverImage: null, format: "TV" } },
    ]);

    const res = await POST(
      req({
        list: [
          { id: 1, score: 9, status: "completed" },
          { id: 2, score: 9, status: "completed" },
          { id: 3, score: 1, status: "completed" },
        ],
      })
    );
    const body = await res.json();
    expect(body.coldStart).toBe(false);
    expect(body.profile.meanScore).toBe(9);
    const candidate = body.pool.find((c: { media: { id: number } }) => c.media.id === 99);
    expect(candidate).toBeDefined();
    // With the fetched-set-based mean, source signal is 9 - 9 = 0, which is
    // filtered out (signal must be > 0), so no community boost accrues.
    expect(candidate.communityBoost).toBe(0);
  });
});
