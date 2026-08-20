import { describe, it, expect } from "vitest";
import { scoreDistribution, statusBreakdown, computeTotals, listTotals } from "@/lib/stats/compute";
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
  return { status, score, progress, updatedAt: "2026-01-01T00:00:00.000Z", isFavorite: false };
}
const se = (m: Media, e: ListEntry): StatEntry => ({ media: m, entry: e });

describe("scoreDistribution", () => {
  it("returns all 10 buckets and counts scored entries", () => {
    const dist = scoreDistribution([
      entry("completed", 9, 12),
      entry("completed", 9, 12),
      entry("watching", null, 3),
    ]);
    expect(dist).toHaveLength(10);
    expect(dist[8]).toEqual({ score: 9, count: 2 });
    expect(dist[0]).toEqual({ score: 1, count: 0 });
  });

  it("counts every entry even when no media/metadata is available for it", () => {
    // Regression: stats must not undercount titles whose /api/media lookup
    // failed or omitted them — scoreDistribution takes raw ListEntry[], not
    // a media-derived subset, so this can't silently drop entries.
    const dist = scoreDistribution([
      entry("completed", 10, 12),
      entry("completed", 10, 12),
      entry("planning", null, 0),
    ]);
    expect(dist[9]).toEqual({ score: 10, count: 2 });
    const total = dist.reduce((sum, b) => sum + b.count, 0);
    expect(total).toBe(2); // only the two scored entries count toward the histogram
  });
});

describe("statusBreakdown", () => {
  it("counts per status in canonical order", () => {
    const b = statusBreakdown([
      entry("watching", null, 1),
      entry("completed", 8, 12),
      entry("completed", 7, 12),
    ]);
    expect(b[0]).toEqual({ status: "watching", count: 1 });
    expect(b[1]).toEqual({ status: "completed", count: 2 });
  });

  it("counts every entry even when no media/metadata is available for it", () => {
    const b = statusBreakdown([
      entry("watching", null, 1),
      entry("completed", 8, 12),
      entry("dropped", 3, 4),
    ]);
    const totalCount = b.reduce((sum, s) => sum + s.count, 0);
    expect(totalCount).toBe(3);
    expect(b.find((s) => s.status === "completed")).toEqual({ status: "completed", count: 1 });
    expect(b.find((s) => s.status === "dropped")).toEqual({ status: "dropped", count: 1 });
  });
});

describe("listTotals", () => {
  it("counts titles, completion and mean score from raw list entries only", () => {
    // Regression for the Important review finding: these must reflect
    // EVERY entry in the store, not just ids the media API returned.
    const entries: ListEntry[] = [
      entry("completed", 10, 12),
      entry("watching", 8, 6),
      entry("completed", 6, 50),
    ];
    const t = listTotals(entries);
    expect(t.titles).toBe(3);
    expect(t.completionRate).toBeCloseTo(2 / 3);
    expect(t.meanScore).toBeCloseTo((10 + 8 + 6) / 3);
  });

  it("still counts entries with no corresponding media at all", () => {
    // No Media objects exist anywhere in this test — listTotals must not
    // require media to count a title, unlike the media-based computeTotals.
    const entries: ListEntry[] = [
      entry("planning", null, 0),
      entry("dropped", 2, 1),
      entry("completed", 9, 1),
    ];
    const t = listTotals(entries);
    expect(t.titles).toBe(3);
    expect(t.completionRate).toBeCloseTo(1 / 3);
    expect(t.meanScore).toBeCloseTo((2 + 9) / 2);
  });

  it("handles an empty list", () => {
    const t = listTotals([]);
    expect(t.titles).toBe(0);
    expect(t.completionRate).toBe(0);
    expect(t.meanScore).toBeNull();
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
