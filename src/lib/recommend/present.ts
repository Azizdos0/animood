import type { Media } from "@/lib/anilist/types";
import type { ScoredCandidate } from "./scoring";
import { mmrRerank } from "./mmr";
import { applyFilters, type ExclusionFilters } from "./filters";
import { buildReason } from "./explain";
import { getMood, moodAffinity, type MoodId } from "./moods";
import { QUALITY_GLOBAL_MEAN, W_QUALITY, W_RANK_QUALITY } from "./constants";

// Tag match is unbounded, so the quality prior inside `base` barely separates a
// 60 from an 85. Rank with an extra, bounded quality term: per point of
// Bayesian rating above the catalog mean (roughly -1.5..+2.5).
const qualityLift = (c: ScoredCandidate) => W_RANK_QUALITY * (c.qualityPrior - QUALITY_GLOBAL_MEAN);

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
    .map(c => {
      if (!mood) return { ...c, base: c.base + qualityLift(c) };
      // Personal signal without the quality prior, squashed so it orders titles
      // within a mood without overriding mood fit.
      const personal = c.base - W_QUALITY * c.qualityPrior;
      return { ...c, base: 2 * Math.tanh(personal / 6) + 4 * moodAffinity(c.media, mood).score + qualityLift(c) };
    });
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
