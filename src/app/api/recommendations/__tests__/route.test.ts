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
});
