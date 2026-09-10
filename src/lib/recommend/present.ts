import type { Media } from "@/lib/anilist/types";
import type { ScoredCandidate } from "./scoring";
import { mmrRerank } from "./mmr";
import { applyFilters, type ExclusionFilters } from "./filters";
import { buildReason } from "./explain";
import { getMood, moodAffinity, type MoodId } from "./moods";

export interface PresentedRec {
  media: Media;
  reasonTags: string[];
  moodReason?: string;
  affinityLabel: string;
}

export function presentRecommendations(
  pool: ScoredCandidate[],
  opts: { diversity: number; filters: ExclusionFilters; topN: number; moodId?: MoodId | null; hiddenIds?: number[] }
): PresentedRec[] {
  const mood = getMood(opts.moodId);
  const hidden = new Set(opts.hiddenIds);
  const filtered = applyFilters(pool, opts.filters)
    .filter(c => !hidden.has(c.media.id))
    .filter(c => !mood || moodAffinity(c.media, mood).score > 0)
    .map(c => mood ? { ...c, base: 2 * Math.tanh(c.base / 6) + 4 * moodAffinity(c.media, mood).score } : c);
  const lambda = 1 - 0.7 * Math.min(1, Math.max(0, opts.diversity));
  const ranked = mmrRerank(filtered, lambda, opts.topN);
  return ranked.map((c) => {
    const reasonTags = buildReason(c).tags;
    return { media: c.media, reasonTags,
      moodReason: mood ? moodAffinity(c.media, mood).evidence.join(" + ") : undefined,
      affinityLabel: mood ? (reasonTags.length ? "Your taste + this mood" : "Fits this mood")
        : reasonTags.length ? "In your comfort zone" : "Worth exploring",
    };
  });
}
