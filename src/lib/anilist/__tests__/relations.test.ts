import { describe, it, expect } from "vitest";
import { relatedByType } from "@/lib/anilist/relations";
import type { Media } from "@/lib/anilist/types";

const media = {
  id: 1, type: "ANIME", title: "S1", coverImage: null, bannerImage: null,
  description: null, genres: [], tags: [], format: "TV", episodes: 12,
  chapters: null, averageScore: null, popularity: 0, seasonYear: null,
  relations: [
    { relationType: "SEQUEL", node: { id: 2, title: "S2", coverImage: null, format: "TV" } },
    { relationType: "ADAPTATION", node: { id: 3, title: "Manga", coverImage: null, format: "MANGA" } },
  ],
} as Media;

describe("relatedByType", () => {
  it("returns only relations of the requested type", () => {
    const sequels = relatedByType(media, "SEQUEL");
    expect(sequels).toHaveLength(1);
    expect(sequels[0].id).toBe(2);
  });

  it("returns an empty array when none match", () => {
    expect(relatedByType(media, "PREQUEL")).toEqual([]);
  });
});
