import { describe, it, expect } from "vitest";
import { buildTasteProfile } from "@/lib/recommend/profile";
import type { RatedTitle } from "@/lib/recommend/types";
import type { Media, MediaTag } from "@/lib/anilist/types";

function media(id: number, tags: [number, string, number][]): Media {
  return {
    id, type: "ANIME", title: `T${id}`, coverImage: null, bannerImage: null,
    description: null, genres: [], format: "TV", episodes: 12, chapters: null,
    averageScore: 70, popularity: 1000, seasonYear: 2020, relations: [],
    tags: tags.map(([tid, name, rank]) => ({ id: tid, name, rank } as MediaTag)),
  };
}

describe("buildTasteProfile", () => {
  it("centers scores and gives loved tags positive affinity", () => {
    const titles: RatedTitle[] = [
      { media: media(1, [[10, "Time Loop", 100]]), score: 10, status: "completed" },
      { media: media(2, [[20, "Slice of Life", 100]]), score: 4, status: "completed" },
    ];
    const p = buildTasteProfile(titles);
    expect(p.meanScore).toBe(7); // (10+4)/2
    expect(p.tags[10].affinity).toBeGreaterThan(0); // loved
    expect(p.tags[20].affinity).toBeLessThan(0);    // disliked
  });

  it("weights a tag by its rank percentage", () => {
    const titles: RatedTitle[] = [
      { media: media(1, [[10, "Time Loop", 50]]), score: 10, status: "completed" },
      { media: media(2, [[10, "Time Loop", 50]]), score: 10, status: "completed" },
    ];
    const p = buildTasteProfile(titles);
    // both scored 10, mean 10 -> centered 0 -> affinity 0
    expect(p.tags[10].affinity).toBe(0);
  });

  it("applies shrinkage so a single-sample tag is pulled toward zero", () => {
    // Common (5x) and Rare (1x) share the SAME raw signal (all scored 10);
    // two low-scored filler titles pull the mean below 10 so the centered
    // signal is non-zero. Equal raw affinity, but the smaller-sample tag
    // shrinks harder toward zero.
    const common: RatedTitle[] = Array.from({ length: 5 }, (_, i) => ({
      media: media(i + 1, [[10, "Common", 100]]), score: 10, status: "completed" as const,
    }));
    const rare: RatedTitle = { media: media(50, [[20, "Rare", 100]]), score: 10, status: "completed" };
    const fillers: RatedTitle[] = Array.from({ length: 2 }, (_, i) => ({
      media: media(80 + i, [[30, "Filler", 100]]), score: 3, status: "completed" as const,
    }));
    const p = buildTasteProfile([...common, rare, ...fillers]);
    expect(p.tags[10].affinity).toBeGreaterThan(0);
    expect(p.tags[20].affinity).toBeGreaterThan(0);
    // same raw signal, but Rare (count 1) shrinks more than Common (count 5)
    expect(Math.abs(p.tags[20].affinity)).toBeLessThan(Math.abs(p.tags[10].affinity));
  });

  it("treats an unscored dropped title as a negative signal", () => {
    const titles: RatedTitle[] = [
      { media: media(1, [[30, "Isekai", 100]]), score: null, status: "dropped" },
      { media: media(2, [[40, "Drama", 100]]), score: 8, status: "completed" },
    ];
    const p = buildTasteProfile(titles);
    expect(p.tags[30].affinity).toBeLessThan(0);
  });

  it("uses the neutral mean fallback with fewer than 2 scored titles", () => {
    const p = buildTasteProfile([
      { media: media(1, [[10, "X", 100]]), score: null, status: "planning" },
    ]);
    expect(p.meanScore).toBe(6);
    expect(p.ratedCount).toBe(0);
  });
});
