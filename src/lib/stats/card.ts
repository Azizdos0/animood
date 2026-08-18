import type { Totals } from "./compute";
import type { Count } from "./breakdowns";

export interface StatsCardData {
  days: string;
  titles: number;
  episodes: number;
  meanScore: string;
  completion: number;
  topGenres: { name: string; pct: number }[];
  loveTags: string[];
}

function formatDays(minutes: number): string {
  const days = minutes / (60 * 24);
  if (days === 0) return "0";
  // whole number if it rounds clean, else one decimal
  const rounded = Math.round(days * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

export function buildStatsCardData(
  totals: Totals,
  genres: Count[],
  loveTags: string[]
): StatsCardData {
  const top = genres.slice(0, 3);
  const max = top.length > 0 ? Math.max(...top.map((g) => g.count), 1) : 1;

  return {
    days: formatDays(totals.minutes),
    titles: totals.titles,
    episodes: totals.episodes,
    meanScore: totals.meanScore !== null ? totals.meanScore.toFixed(1) : "—",
    completion: Math.round(totals.completionRate * 100),
    topGenres: top.map((g) => ({ name: g.name, pct: Math.round((g.count / max) * 100) })),
    loveTags: loveTags.slice(0, 4),
  };
}
