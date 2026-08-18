import { describe, it, expect } from "vitest";
import { scoreDistribution, statusBreakdown, computeTotals } from "@/lib/stats/compute";
import type { StatEntry } from "@/lib/stats/types";
import type { Media, MediaType } from "@/lib/anilist/types";
import type { ListEntry, ListStatus } from "@/lib/list/schema";

function media(id: number, type: MediaType, episodes: number | null, chapters: number | null = null): Media {
  return {
    id, type, title: `T${id}`, coverImage: null, bannerImage: null, description: null,
    genres: [], tags: [], format: type === "ANIME" ? "TV" : "MANGA", episodes, chapters,
    averageScore: 70, popularity: 1000, seasonYear: 2020, relations: [],
  };
}
function entry(status: ListStatus, score: number | null, progress: number): ListEntry {
  return { status, score, progress, updatedAt: "2026-01-01T00:00:00.000Z" };
}
const se = (m: Media, e: ListEntry): StatEntry => ({ media: m, entry: e });

describe("scoreDistribution", () => {
  it("returns all 10 buckets and counts scored entries", () => {
    const dist = scoreDistribution([
      se(media(1, "ANIME", 12), entry("completed", 9, 12)),
      se(media(2, "ANIME", 12), entry("completed", 9, 12)),
      se(media(3, "ANIME", 12), entry("watching", null, 3)),
    ]);
    expect(dist).toHaveLength(10);
    expect(dist[8]).toEqual({ score: 9, count: 2 });
    expect(dist[0]).toEqual({ score: 1, count: 0 });
  });
});

describe("statusBreakdown", () => {
  it("counts per status in canonical order", () => {
    const b = statusBreakdown([
      se(media(1, "ANIME", 12), entry("watching", null, 1)),
      se(media(2, "ANIME", 12), entry("completed", 8, 12)),
      se(media(3, "ANIME", 12), entry("completed", 7, 12)),
    ]);
    expect(b[0]).toEqual({ status: "watching", count: 1 });
    expect(b[1]).toEqual({ status: "completed", count: 2 });
  });
});

describe("computeTotals", () => {
  it("computes episodes, minutes, completion and mean score", () => {
    const t = computeTotals([
      se(media(1, "ANIME", 24), entry("completed", 10, 0)), // completed -> 24 eps
      se(media(2, "ANIME", 24), entry("watching", 8, 6)),   // watching -> 6 eps
      se(media(3, "MANGA", null, 100), entry("completed", 6, 50)), // completed manga
    ]);
    expect(t.titles).toBe(3);
    expect(t.anime).toBe(2);
    expect(t.manga).toBe(1);
    expect(t.episodes).toBe(30);       // 24 (completed) + 6 (watching progress)
    expect(t.minutes).toBe(30 * 24);
    expect(t.chapters).toBe(100);      // completed manga -> media.chapters (100), not progress
    expect(t.completionRate).toBeCloseTo(2 / 3);
    expect(t.meanScore).toBeCloseTo((10 + 8 + 6) / 3);
  });

  it("handles an empty list", () => {
    const t = computeTotals([]);
    expect(t.titles).toBe(0);
    expect(t.completionRate).toBe(0);
    expect(t.meanScore).toBeNull();
  });
});
