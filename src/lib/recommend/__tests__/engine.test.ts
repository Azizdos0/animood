import { describe, it, expect } from "vitest";
import { assemblePool } from "@/lib/recommend/engine";
import type { RatedTitle } from "@/lib/recommend/types";
import type { Media, MediaTag } from "@/lib/anilist/types";

function media(id: number, tags: [number, string, number][]): Media {
  return {
    id, type: "ANIME", title: `T${id}`, coverImage: null, bannerImage: null,
    description: null, genres: [], format: "TV", episodes: 12, chapters: null,
    averageScore: 75, popularity: 20000, seasonYear: 2020, relations: [],
    tags: tags.map(([tid, name, rank]) => ({ id: tid, name, rank } as MediaTag)),
  };
}

describe("assemblePool", () => {
  const rated: RatedTitle[] = [
    { media: media(1, [[10, "Time Loop", 100]]), score: 9, status: "completed" },
    { media: media(2, [[20, "Romance", 100]]), score: 5, status: "completed" },
  ];

  it("excludes already-listed candidates and scores the rest", () => {
    const candidateMedia = [media(1, [[10, "Time Loop", 100]]), media(3, [[10, "Time Loop", 100]])];
    const { profile, pool } = assemblePool({
      rated, candidateMedia, communityRaw: [], listedIds: new Set([1, 2]),
    });
    expect(profile.tags[10].affinity).toBeGreaterThan(0);
    expect(pool.map((c) => c.media.id)).toEqual([3]); // 1 is listed
  });

  it("adds community boost and sorts by base desc", () => {
    const candidateMedia = [media(3, [[10, "Time Loop", 100]]), media(4, [[10, "Time Loop", 100]])];
    const { pool } = assemblePool({
      rated, candidateMedia,
      communityRaw: [{ candidateId: 4, rating: 100, sourceScoreSignal: 2 }],
      listedIds: new Set([1, 2]),
    });
    expect(pool[0].media.id).toBe(4); // community boost lifts 4 above 3
    expect(pool[0].communityBoost).toBeGreaterThan(0);
  });

  it("drops candidates that are sequels of an unwatched title", () => {
    const sequel = media(5, [[10, "Time Loop", 100]]);
    sequel.relations = [
      { relationType: "PREQUEL", node: { id: 900, title: "S1", coverImage: null, format: "TV" } },
    ];
    const { pool } = assemblePool({
      rated, candidateMedia: [sequel], communityRaw: [], listedIds: new Set([1, 2]),
    });
    expect(pool).toHaveLength(0); // prequel 900 is not on the list
  });
});
