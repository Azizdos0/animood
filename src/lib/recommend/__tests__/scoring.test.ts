import { describe, it, expect } from "vitest";
import { bayesianRating, tagMatch, scoreCandidate } from "@/lib/recommend/scoring";
import type { TasteProfile } from "@/lib/recommend/types";
import type { Media, MediaTag } from "@/lib/anilist/types";

function media(id: number, avg: number | null, pop: number, tags: [number, string, number][]): Media {
  return {
    id, type: "ANIME", title: `T${id}`, coverImage: null, bannerImage: null,
    description: null, genres: [], format: "TV", episodes: 12, chapters: null,
    averageScore: avg, popularity: pop, seasonYear: 2020, relations: [],
    tags: tags.map(([tid, name, rank]) => ({ id: tid, name, rank } as MediaTag)),
  };
}

const profile: TasteProfile = {
  meanScore: 7, ratedCount: 5,
  tags: {
    10: { tagId: 10, name: "Time Loop", affinity: 2, count: 4 },
    20: { tagId: 20, name: "Slice of Life", affinity: -1.5, count: 3 },
  },
};

describe("bayesianRating", () => {
  it("pulls low-vote titles toward the global mean", () => {
    const lowVotes = bayesianRating(100, 1); // avg 10 but ~no votes
    const manyVotes = bayesianRating(100, 1_000_000);
    expect(manyVotes).toBeGreaterThan(lowVotes);
    expect(lowVotes).toBeLessThan(10);
  });

  it("returns the global mean when averageScore is null", () => {
    expect(bayesianRating(null, 5000)).toBe(6.5);
  });
});

describe("tagMatch", () => {
  it("rewards aligned tags and penalizes disliked ones", () => {
    const aligned = tagMatch(media(1, 70, 1000, [[10, "Time Loop", 100]]), profile);
    const disliked = tagMatch(media(2, 70, 1000, [[20, "Slice of Life", 100]]), profile);
    expect(aligned.value).toBeGreaterThan(0);
    expect(disliked.value).toBeLessThan(0);
    expect(aligned.contributions[0].tagId).toBe(10);
  });

  it("ignores tags not in the profile", () => {
    const m = tagMatch(media(3, 70, 1000, [[999, "Unknown", 100]]), profile);
    expect(m.value).toBe(0);
    expect(m.contributions).toHaveLength(0);
  });
});

describe("scoreCandidate", () => {
  it("combines match, quality and community into a base score", () => {
    const s = scoreCandidate(media(1, 80, 50000, [[10, "Time Loop", 100]]), profile, 1);
    expect(s.tagMatch).toBeGreaterThan(0);
    expect(s.qualityPrior).toBeGreaterThan(0);
    expect(s.communityBoost).toBe(1);
    expect(s.base).toBeGreaterThan(s.tagMatch); // quality + community add on top
  });
});
