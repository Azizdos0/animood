import { describe, it, expect } from "vitest";
import { buildStatsCardData } from "@/lib/stats/card";
import { buildStatsCardSvg } from "@/lib/stats/card-svg";
import type { Totals } from "@/lib/stats/compute";

const totals: Totals = {
  titles: 120,
  anime: 100,
  manga: 20,
  episodes: 2400,
  minutes: 2400 * 24, // 57,600 min = 40 days
  chapters: 500,
  completionRate: 0.75,
  meanScore: 8.4,
};

describe("buildStatsCardData", () => {
  it("derives headline numbers", () => {
    const d = buildStatsCardData(totals, [], []);
    expect(d.titles).toBe(120);
    expect(d.episodes).toBe(2400);
    expect(d.days).toBe("40");
    expect(d.meanScore).toBe("8.4");
    expect(d.completion).toBe(75);
  });

  it("shows an em dash when there is no mean score", () => {
    const d = buildStatsCardData({ ...totals, meanScore: null }, [], []);
    expect(d.meanScore).toBe("—");
  });

  it("normalizes top genres to percentages of the max and caps at 3", () => {
    const d = buildStatsCardData(
      totals,
      [
        { name: "Action", count: 40 },
        { name: "Comedy", count: 20 },
        { name: "Drama", count: 10 },
        { name: "Sci-Fi", count: 5 },
      ],
      []
    );
    expect(d.topGenres).toHaveLength(3);
    expect(d.topGenres[0]).toEqual({ name: "Action", pct: 100 });
    expect(d.topGenres[1].pct).toBe(50);
  });

  it("caps love tags at 4", () => {
    const d = buildStatsCardData(totals, [], ["A", "B", "C", "D", "E"]);
    expect(d.loveTags).toEqual(["A", "B", "C", "D"]);
  });
});

describe("buildStatsCardSvg", () => {
  it("produces a 1200x630 svg containing the headline stats", () => {
    const data = buildStatsCardData(totals, [{ name: "Action", count: 10 }], ["Tragedy"]);
    const svg = buildStatsCardSvg(data);
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg).toContain('width="1200"');
    expect(svg).toContain('height="630"');
    expect(svg).toContain("Animood");
    expect(svg).toContain("40"); // days
    expect(svg).toContain("Tragedy");
    expect(svg).toContain("Action");
  });

  it("escapes XML-special characters in names", () => {
    const data = buildStatsCardData(totals, [{ name: "Rock & Roll", count: 1 }], ["<evil>"]);
    const svg = buildStatsCardSvg(data);
    expect(svg).toContain("Rock &amp; Roll");
    expect(svg).toContain("&lt;evil&gt;");
    expect(svg).not.toContain("<evil>");
  });
});
