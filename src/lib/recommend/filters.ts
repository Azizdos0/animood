import type { Media } from "@/lib/anilist/types";
import { relatedByType } from "@/lib/anilist/relations";
import type { ScoredCandidate } from "./scoring";

export interface ExclusionFilters {
  genres: string[];
  formats: string[];
}

export function applyFilters(
  candidates: ScoredCandidate[],
  filters: ExclusionFilters
): ScoredCandidate[] {
  const genreSet = new Set(filters.genres.map((g) => g.toLowerCase()));
  const formatSet = new Set(filters.formats);
  return candidates.filter((c) => {
    if (c.media.format && formatSet.has(c.media.format)) return false;
    if (c.media.genres.some((g) => genreSet.has(g.toLowerCase()))) return false;
    return true;
  });
}

export function isUnwatchedSequel(candidate: Media, listedIds: Set<number>): boolean {
  const prequels = relatedByType(candidate, "PREQUEL");
  if (prequels.length === 0) return false;
  return prequels.some((p) => !listedIds.has(p.id));
}
