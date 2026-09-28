import { describe, expect, it } from "vitest";
import type { Media } from "@/lib/anilist/types";
import { episodesBehind, formatCountdown, groupByDay } from "../airing";

// Local-time dates keep these tests independent of the machine's timezone.
const NOW = new Date(2026, 8, 28, 10, 0).getTime(); // Mon 28 Sep 2026, 10:00 local
const at = (dayOffset: number, h: number, m = 0) => new Date(2026, 8, 28 + dayOffset, h, m).getTime() / 1000;
const media = (id: number, airingAt: number | null, episode = 5, title = `T${id}`): Media => ({
  id, type: "ANIME", title, coverImage: null, bannerImage: null, description: null, genres: [], tags: [],
  format: "TV", episodes: 12, chapters: null, averageScore: 80, popularity: 1000, seasonYear: 2026, relations: [],
  status: "RELEASING", nextAiringEpisode: airingAt === null ? null : { episode, airingAt },
});

describe("formatCountdown", () => {
  it("formats days+hours, hours+minutes and minutes", () => {
    expect(formatCountdown(at(2, 14), NOW)).toBe("in 2d 4h");
    expect(formatCountdown(at(3, 10), NOW)).toBe("in 3d");
    expect(formatCountdown(at(0, 13, 20), NOW)).toBe("in 3h 20m");
    expect(formatCountdown(at(0, 12), NOW)).toBe("in 2h");
    expect(formatCountdown(at(0, 10, 45), NOW)).toBe("in 45m");
  });
  it("rounds up partial minutes and never shows 0m or 60m", () => {
    expect(formatCountdown(NOW / 1000 + 1, NOW)).toBe("in 1m");
    expect(formatCountdown(NOW / 1000 + 59 * 60 + 30, NOW)).toBe("in 1h");
  });
  it("says out now once the time has passed", () => {
    expect(formatCountdown(NOW / 1000, NOW)).toBe("out now");
    expect(formatCountdown(at(-1, 10), NOW)).toBe("out now");
  });
});

describe("episodesBehind", () => {
  it("counts aired episodes the viewer hasn't logged", () => {
    expect(episodesBehind(4, { episode: 8, airingAt: at(1, 10) }, NOW)).toBe(3); // eps 5–7 out
    expect(episodesBehind(7, { episode: 8, airingAt: at(1, 10) }, NOW)).toBe(0);
  });
  it("treats a cached next episode whose time passed as aired", () => {
    expect(episodesBehind(7, { episode: 8, airingAt: at(0, 9) }, NOW)).toBe(1);
  });
  it("is zero with no next episode or when ahead", () => {
    expect(episodesBehind(3, null, NOW)).toBe(0);
    expect(episodesBehind(9, { episode: 8, airingAt: at(1, 10) }, NOW)).toBe(0);
  });
});

describe("groupByDay", () => {
  it("makes seven local days starting today with friendly labels", () => {
    const days = groupByDay([], NOW);
    expect(days).toHaveLength(7);
    expect(days[0].label).toBe("Today");
    expect(days[1].label).toBe("Tomorrow");
    expect(days[2].date.getDate()).toBe(30);
  });
  it("places episodes by local day, sorted by time, and drops out-of-range ones", () => {
    const days = groupByDay([
      { media: media(1, at(0, 22)), mine: false },
      { media: media(2, at(0, 11)), mine: false },
      { media: media(3, at(6, 23, 59)), mine: false },
      { media: media(4, at(7, 0, 1)), mine: false },   // day 8: dropped
      { media: media(5, at(-1, 23)), mine: false },    // yesterday: dropped
      { media: media(6, null), mine: false },          // nothing scheduled
    ], NOW);
    expect(days[0].items.map((i) => i.media.id)).toEqual([2, 1]);
    expect(days[6].items.map((i) => i.media.id)).toEqual([3]);
    expect(days.flatMap((d) => d.items).map((i) => i.media.id).sort()).toEqual([1, 2, 3]);
  });
  it("keeps an episode that aired earlier today", () => {
    expect(groupByDay([{ media: media(1, at(0, 1)), mine: true }], NOW)[0].items).toHaveLength(1);
  });
  it("lists a show once and marks it mine if any source is the viewer's list", () => {
    const days = groupByDay([
      { media: media(1, at(1, 12)), mine: false },
      { media: media(1, at(1, 12)), mine: true },
    ], NOW);
    expect(days[1].items).toHaveLength(1);
    expect(days[1].items[0].mine).toBe(true);
  });
});
