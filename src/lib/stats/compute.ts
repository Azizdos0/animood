import type { MediaType } from "@/lib/anilist/types";
import { LIST_STATUSES, type ListStatus } from "@/lib/list/schema";
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

function unitsConsumed(e: StatEntry, type: MediaType): number {
  const total = type === "ANIME" ? e.media.episodes : e.media.chapters;
  if (e.entry.status === "completed") return total ?? e.entry.progress;
  return e.entry.progress;
}

export function scoreDistribution(entries: StatEntry[]): { score: number; count: number }[] {
  const buckets = Array.from({ length: 10 }, (_, i) => ({ score: i + 1, count: 0 }));
  for (const e of entries) {
    if (e.entry.score !== null && e.entry.score >= 1 && e.entry.score <= 10) {
      buckets[e.entry.score - 1].count += 1;
    }
  }
  return buckets;
}

export function statusBreakdown(entries: StatEntry[]): { status: ListStatus; count: number }[] {
  return LIST_STATUSES.map((status) => ({
    status,
    count: entries.filter((e) => e.entry.status === status).length,
  }));
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
