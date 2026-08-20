import { describe, it, expect } from "vitest";
import { genreBreakdown, topTags, formatBreakdown, tasteAffinitySummary } from "@/lib/stats/breakdowns";
import type { StatEntry } from "@/lib/stats/types";
import type { Media, MediaType, MediaTag } from "@/lib/anilist/types";
import type { ListEntry, ListStatus } from "@/lib/list/schema";

function media(id: number, opts: Partial<Media> = {}): Media {
  return {
    id, type: "ANIME" as MediaType, title: `T${id}`, coverImage: null, bannerImage: null,
    description: null, genres: [], tags: [], format: "TV", episodes: 12, chapters: null,
    averageScore: 70, popularity: 1000, seasonYear: 2020, relations: [], ...opts,
  };
}
const e = (status: ListStatus, score: number | null): ListEntry => ({ status, score, progress: 0, updatedAt: "", isFavorite: false });
const se = (m: Media, en: ListEntry): StatEntry => ({ media: m, entry: en });

describe("genreBreakdown", () => {
  it("counts and sorts genres", () => {
    const out = genreBreakdown([
      se(media(1, { genres: ["Action", "Comedy"] }), e("completed", 8)),
      se(media(2, { genres: ["Action"] }), e("completed", 7)),
    ]);
    expect(out[0]).toEqual({ name: "Action", count: 2 });
    expect(out[1]).toEqual({ name: "Comedy", count: 1 });
  });
});

describe("formatBreakdown", () => {
  it("counts formats", () => {
    const out = formatBreakdown([
      se(media(1, { format: "TV" }), e("completed", 8)),
      se(media(2, { format: "MOVIE" }), e("completed", 8)),
      se(media(3, { format: "TV" }), e("completed", 8)),
    ]);
    expect(out[0]).toEqual({ name: "TV", count: 2 });
  });
});

describe("topTags", () => {
  it("counts tags at or above the rank threshold", () => {
    const tag = (id: number, name: string, rank: number): MediaTag => ({ id, name, rank });
    const out = topTags([
      se(media(1, { tags: [tag(1, "Time Loop", 90), tag(2, "Weak", 20)] }), e("completed", 9)),
      se(media(2, { tags: [tag(1, "Time Loop", 80)] }), e("completed", 9)),
    ]);
    expect(out[0]).toEqual({ name: "Time Loop", count: 2 });
    expect(out.find((t) => t.name === "Weak")).toBeUndefined();
  });
});

describe("tasteAffinitySummary", () => {
  it("splits positive and negative affinities", () => {
    const tag = (id: number, name: string, rank: number): MediaTag => ({ id, name, rank });
    const { positive, negative } = tasteAffinitySummary([
      se(media(1, { tags: [tag(10, "Loved", 100)] }), e("completed", 10)),
      se(media(2, { tags: [tag(20, "Hated", 100)] }), e("completed", 4)),
    ]);
    expect(positive[0].name).toBe("Loved");
    expect(negative[0].name).toBe("Hated");
  });
});
