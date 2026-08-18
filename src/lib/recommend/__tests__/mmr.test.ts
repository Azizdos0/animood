import { describe, it, expect } from "vitest";
import { tagCosine, mmrRerank } from "@/lib/recommend/mmr";
import type { ScoredCandidate } from "@/lib/recommend/scoring";
import type { Media, MediaTag } from "@/lib/anilist/types";

function media(id: number, tags: [number, number][]): Media {
  return {
    id, type: "ANIME", title: `T${id}`, coverImage: null, bannerImage: null,
    description: null, genres: [], format: "TV", episodes: 12, chapters: null,
    averageScore: 70, popularity: 1000, seasonYear: 2020, relations: [],
    tags: tags.map(([tid, rank]) => ({ id: tid, name: `t${tid}`, rank } as MediaTag)),
  };
}
const cand = (id: number, base: number, tags: [number, number][]): ScoredCandidate => ({
  media: media(id, tags), base, tagMatch: base, qualityPrior: 0, communityBoost: 0, contributions: [],
});

describe("tagCosine", () => {
  it("is 1 for identical tag vectors and 0 for disjoint", () => {
    expect(tagCosine(media(1, [[10, 100]]), media(2, [[10, 100]]))).toBeCloseTo(1);
    expect(tagCosine(media(1, [[10, 100]]), media(2, [[20, 100]]))).toBe(0);
  });
});

describe("mmrRerank", () => {
  it("with lambda=1 returns pure base-score order", () => {
    const pool = [cand(1, 1, [[10, 100]]), cand(2, 3, [[10, 100]]), cand(3, 2, [[10, 100]])];
    const out = mmrRerank(pool, 1, 3).map((c) => c.media.id);
    expect(out).toEqual([2, 3, 1]);
  });

  it("with low lambda prefers a diverse second pick over a near-duplicate", () => {
    // 1 is top; 2 is a near-duplicate of 1; 3 is slightly lower but different.
    const pool = [
      cand(1, 10, [[10, 100]]),
      cand(2, 9, [[10, 100]]),
      cand(3, 8, [[20, 100]]),
    ];
    const out = mmrRerank(pool, 0.2, 3).map((c) => c.media.id);
    expect(out[0]).toBe(1);
    expect(out[1]).toBe(3); // diversity beats the near-duplicate #2
  });

  it("caps output at topN", () => {
    const pool = [cand(1, 1, [[10, 100]]), cand(2, 2, [[10, 100]]), cand(3, 3, [[10, 100]])];
    expect(mmrRerank(pool, 1, 2)).toHaveLength(2);
  });
});
