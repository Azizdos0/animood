import { buildTasteProfile } from "@/lib/recommend/profile";
import type { RatedTitle, TagAffinity } from "@/lib/recommend/types";
import type { StatEntry } from "./types";

export interface Count {
  name: string;
  count: number;
}

const TAG_PRESENT_RANK = 60;

function tally(names: string[]): Count[] {
  const map = new Map<string, number>();
  for (const n of names) map.set(n, (map.get(n) ?? 0) + 1);
  return [...map.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

export function genreBreakdown(entries: StatEntry[]): Count[] {
  return tally(entries.flatMap((e) => e.media.genres));
}

export function formatBreakdown(entries: StatEntry[]): Count[] {
  return tally(
    entries.map((e) => e.media.format).filter((f): f is NonNullable<typeof f> => f !== null)
  );
}

export function topTags(entries: StatEntry[], n = 12): Count[] {
  const names = entries.flatMap((e) =>
    (e.media.tags ?? []).filter((t) => t.rank >= TAG_PRESENT_RANK).map((t) => t.name)
  );
  return tally(names).slice(0, n);
}

export function tasteAffinitySummary(
  entries: StatEntry[],
  n = 8
): { positive: TagAffinity[]; negative: TagAffinity[] } {
  const rated: RatedTitle[] = entries.map((e) => ({
    media: e.media, score: e.entry.score, status: e.entry.status,
  }));
  const profile = buildTasteProfile(rated);
  const all = Object.values(profile.tags).filter((t) => Math.abs(t.affinity) > 0.001);
  const positive = [...all].filter((t) => t.affinity > 0).sort((a, b) => b.affinity - a.affinity).slice(0, n);
  const negative = [...all].filter((t) => t.affinity < 0).sort((a, b) => a.affinity - b.affinity).slice(0, n);
  return { positive, negative };
}
