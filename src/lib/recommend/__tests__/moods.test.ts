import { describe, expect, it } from "vitest";
import { presentRecommendations } from "../present";
import { buildTasteProfile } from "../profile";
import type { ScoredCandidate } from "../scoring";

const candidate = (id: number, genres: string[], tags: string[] = [], base = 3): ScoredCandidate => ({
  media: { id, title: `Title ${id}`, type: "ANIME", genres,
    tags: tags.map((name, i) => ({ id: i + 1, name, rank: 100 })),
    coverImage: null, bannerImage: null, description: null, format: "TV", episodes: 12,
    chapters: null, averageScore: 80, popularity: 20000, seasonYear: 2020, relations: [] },
  base, tagMatch: 0, qualityPrior: 8, communityBoost: 0, contributions: [],
});
const options = { diversity: 0, filters: { genres: [], formats: [] }, topN: 2 };

describe("mood discovery", () => {
  it("keeps comfort picks free of horror even when the personal score is higher", () => {
    const pool = [candidate(1, ["Comedy", "Horror"], [], 20), candidate(2, ["Comedy"], ["Iyashikei"])];
    const result = presentRecommendations(pool, { ...options, moodId: "comfort" });
    expect(result.map(r => r.media.id)).toEqual([2]);
    expect(result[0].moodReason).toContain("Comedy");
  });
  it("changes the shortlist when the mood changes", () => {
    const pool = [candidate(1, ["Action"]), candidate(2, ["Slice of Life"], ["Iyashikei"])];
    expect(presentRecommendations(pool, { ...options, moodId: "adrenaline" })[0].media.id).toBe(1);
    expect(presentRecommendations(pool, { ...options, moodId: "calm" })[0].media.id).toBe(2);
  });
  it("uses personal taste to order titles that fit the same mood", () => {
    const pool = [candidate(1, ["Drama"], [], 2), candidate(2, ["Drama"], [], 6)];
    expect(presentRecommendations(pool, { ...options, moodId: "emotional" })[0].media.id).toBe(2);
  });
  it("removes hidden titles before selecting the shortlist so new picks fill the space", () => {
    const pool = [candidate(1, ["Action"], [], 5), candidate(2, ["Action"], [], 4), candidate(3, ["Action"])];
    expect(presentRecommendations(pool, { ...options, hiddenIds: [1] }).map(r => r.media.id)).toEqual([2, 3]);
  });
  it("uses three starter favorites as positive signals without inventing ratings", () => {
    const profile = buildTasteProfile([1, 2, 3].map(id => ({
      media: candidate(id, [], ["Found Family"]).media, score: null, status: "completed", preference: "liked",
    })));
    expect(profile.ratedCount).toBe(0);
    expect(profile.tags[1].affinity).toBeGreaterThan(0);
  });
});
