import { describe, it, expect } from "vitest";
import { applyFilters, isUnwatchedSequel } from "@/lib/recommend/filters";
import type { ScoredCandidate } from "@/lib/recommend/scoring";
import type { Media } from "@/lib/anilist/types";

function media(id: number, genres: string[], format: string, relations: Media["relations"] = []): Media {
  return {
    id, type: "ANIME", title: `T${id}`, coverImage: null, bannerImage: null,
    description: null, genres, tags: [], format: format as Media["format"], episodes: 12,
    chapters: null, averageScore: 70, popularity: 1000, seasonYear: 2020, relations,
  };
}
const cand = (m: Media): ScoredCandidate => ({
  media: m, base: 1, tagMatch: 1, qualityPrior: 0, communityBoost: 0, contributions: [],
});

describe("applyFilters", () => {
  it("drops candidates matching an excluded genre (case-insensitive)", () => {
    const pool = [cand(media(1, ["Ecchi"], "TV")), cand(media(2, ["Action"], "TV"))];
    const out = applyFilters(pool, { genres: ["ecchi"], formats: [] });
    expect(out.map((c) => c.media.id)).toEqual([2]);
  });

  it("drops candidates matching an excluded format", () => {
    const pool = [cand(media(1, [], "MOVIE")), cand(media(2, [], "TV"))];
    const out = applyFilters(pool, { genres: [], formats: ["MOVIE"] });
    expect(out.map((c) => c.media.id)).toEqual([2]);
  });
});

describe("isUnwatchedSequel", () => {
  it("is true when a prequel is not on the user's list", () => {
    const seq = media(2, [], "TV", [
      { relationType: "PREQUEL", node: { id: 1, title: "S1", coverImage: null, format: "TV" } },
    ]);
    expect(isUnwatchedSequel(seq, new Set<number>())).toBe(true);
    expect(isUnwatchedSequel(seq, new Set<number>([1]))).toBe(false);
  });

  it("is false with no prequel relation", () => {
    expect(isUnwatchedSequel(media(5, [], "TV"), new Set<number>())).toBe(false);
  });
});
