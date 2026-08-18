import { describe, it, expect } from "vitest";
import { presentRecommendations } from "@/lib/recommend/present";
import type { ScoredCandidate } from "@/lib/recommend/scoring";
import type { Media } from "@/lib/anilist/types";

function media(id: number, genres: string[]): Media {
  return {
    id, type: "ANIME", title: `T${id}`, coverImage: null, bannerImage: null,
    description: null, genres, tags: [], format: "TV", episodes: 12, chapters: null,
    averageScore: 70, popularity: 1000, seasonYear: 2020, relations: [],
  };
}
const cand = (id: number, base: number, genres: string[] = []): ScoredCandidate => ({
  media: media(id, genres), base, tagMatch: base, qualityPrior: 0, communityBoost: 0,
  contributions: [{ tagId: 1, name: "Action", value: 2 }],
});

describe("presentRecommendations", () => {
  it("applies exclusion filters then ranks and attaches reasons", () => {
    const pool = [cand(1, 3, ["Ecchi"]), cand(2, 2), cand(3, 1)];
    const out = presentRecommendations(pool, {
      diversity: 1, filters: { genres: ["Ecchi"], formats: [] }, topN: 10,
    });
    expect(out.map((r) => r.media.id)).toEqual([2, 3]); // 1 filtered
    expect(out[0].reasonTags).toContain("Action");
  });

  it("caps at topN", () => {
    const pool = [cand(1, 3), cand(2, 2), cand(3, 1)];
    expect(presentRecommendations(pool, {
      diversity: 1, filters: { genres: [], formats: [] }, topN: 2,
    })).toHaveLength(2);
  });
});
