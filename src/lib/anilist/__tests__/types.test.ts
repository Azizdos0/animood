import { describe, it, expect } from "vitest";
import type { Media, MediaTag } from "@/lib/anilist/types";
import { isAnime } from "@/lib/anilist/types";

describe("anilist types", () => {
  it("exposes an isAnime type guard", () => {
    const tag: MediaTag = { id: 1, name: "Psychological", rank: 90 };
    const media: Media = {
      id: 1, type: "ANIME", title: "Test", coverImage: null, bannerImage: null,
      description: null, genres: ["Drama"], tags: [tag], format: "TV",
      episodes: 12, chapters: null, averageScore: 80, popularity: 1000,
      seasonYear: 2020, relations: [],
    };
    expect(isAnime(media)).toBe(true);
  });
});
