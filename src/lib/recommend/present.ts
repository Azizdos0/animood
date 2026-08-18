import type { Media } from "@/lib/anilist/types";
import type { ScoredCandidate } from "./scoring";
import { mmrRerank } from "./mmr";
import { applyFilters, type ExclusionFilters } from "./filters";
import { buildReason } from "./explain";

export interface PresentedRec {
  media: Media;
  reasonTags: string[];
}

export function presentRecommendations(
  pool: ScoredCandidate[],
  opts: { diversity: number; filters: ExclusionFilters; topN: number }
): PresentedRec[] {
  const filtered = applyFilters(pool, opts.filters);
  const lambda = 1 - 0.7 * Math.min(1, Math.max(0, opts.diversity));
  const ranked = mmrRerank(filtered, lambda, opts.topN);
  return ranked.map((c) => ({ media: c.media, reasonTags: buildReason(c).tags }));
}
