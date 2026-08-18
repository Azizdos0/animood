import type { MediaType } from "@/lib/anilist/types";
import { LIST_STATUSES, type ListEntry, type ListStatus } from "@/lib/list/schema";
import { ANIME_MINUTES_PER_EP } from "./constants";
import type { StatEntry } from "./types";

export interface Totals {
  titles: number;
  anime: number;
  manga: number;
  episodes: number;
  minutes: number;
  chapters: number;
  completionRate: number;
  meanScore: number | null;
}

/**
 * List-level totals: titles / completion / mean score. These need only
 * `ListEntry` data, so they must reflect EVERY entry in the store — not
 * just the subset whose media happened to be returned by `/api/media`.
 */
export interface ListTotals {
  titles: number;
  completionRate: number;
  meanScore: number | null;
}

function unitsConsumed(e: StatEntry, type: MediaType): number {
  const total = type === "ANIME" ? e.media.episodes : e.media.chapters;
  if (e.entry.status === "completed") return total ?? e.entry.progress;
  return e.entry.progress;
}

/**
 * Score histogram over raw list entries — deliberately independent of
 * fetched media, so titles with missing metadata still count.
 */
export function scoreDistribution(entries: ListEntry[]): { score: number; count: number }[] {
  const buckets = Array.from({ length: 10 }, (_, i) => ({ score: i + 1, count: 0 }));
  for (const e of entries) {
    if (e.score !== null && e.score >= 1 && e.score <= 10) {
      buckets[e.score - 1].count += 1;
    }
  }
  return buckets;
}

/**
 * Per-status counts over raw list entries — deliberately independent of
 * fetched media, so titles with missing metadata still count.
 */
export function statusBreakdown(entries: ListEntry[]): { status: ListStatus; count: number }[] {
  return LIST_STATUSES.map((status) => ({
    status,
    count: entries.filter((e) => e.status === status).length,
  }));
}

/**
 * Titles / completion rate / mean score, computed from the full set of
 * `ListEntry` records (i.e. `store.entries`). Unlike `computeTotals`, this
 * never depends on whether media metadata was fetched successfully.
 */
export function listTotals(entries: ListEntry[]): ListTotals {
  const titles = entries.length;
  let completed = 0;
  let scoreSum = 0;
  let scoreCount = 0;

  for (const e of entries) {
    if (e.status === "completed") completed += 1;
    if (e.score !== null) {
      scoreSum += e.score;
      scoreCount += 1;
    }
  }

  return {
    titles,
    completionRate: titles > 0 ? completed / titles : 0,
    meanScore: scoreCount > 0 ? scoreSum / scoreCount : null,
  };
}

export function computeTotals(entries: StatEntry[]): Totals {
  let anime = 0, manga = 0, episodes = 0, chapters = 0, completed = 0;
  let scoreSum = 0, scoreCount = 0;

  for (const e of entries) {
    if (e.media.type === "ANIME") {
      anime += 1;
      episodes += unitsConsumed(e, "ANIME");
    } else {
      manga += 1;
      chapters += unitsConsumed(e, "MANGA");
    }
    if (e.entry.status === "completed") completed += 1;
    if (e.entry.score !== null) {
      scoreSum += e.entry.score;
      scoreCount += 1;
    }
  }

  const titles = entries.length;
  return {
    titles, anime, manga, episodes,
    minutes: episodes * ANIME_MINUTES_PER_EP,
    chapters,
    completionRate: titles > 0 ? completed / titles : 0,
    meanScore: scoreCount > 0 ? scoreSum / scoreCount : null,
  };
}
