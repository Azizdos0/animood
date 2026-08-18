import type { Media } from "@/lib/anilist/types";
import type { TasteProfile } from "./types";
import {
  QUALITY_GLOBAL_MEAN, QUALITY_MIN_VOTES, W_COMMUNITY, W_MATCH, W_QUALITY,
} from "./constants";

export interface TagContribution {
  tagId: number;
  name: string;
  value: number;
}

export interface ScoredCandidate {
  media: Media;
  base: number;
  tagMatch: number;
  qualityPrior: number;
  communityBoost: number;
  contributions: TagContribution[];
}

export function bayesianRating(averageScore: number | null, popularity: number): number {
  if (averageScore === null) return QUALITY_GLOBAL_MEAN;
  const R = averageScore / 10; // 0–100 -> 0–10
  const v = Math.max(0, popularity);
  const m = QUALITY_MIN_VOTES;
  const C = QUALITY_GLOBAL_MEAN;
  return (v / (v + m)) * R + (m / (v + m)) * C;
}

export function tagMatch(
  media: Media,
  profile: TasteProfile
): { value: number; contributions: TagContribution[] } {
  const contributions: TagContribution[] = [];
  let value = 0;
  for (const tag of media.tags) {
    const aff = profile.tags[tag.id];
    if (!aff) continue;
    const v = aff.affinity * (tag.rank / 100);
    if (v === 0) continue;
    value += v;
    contributions.push({ tagId: tag.id, name: tag.name, value: v });
  }
  contributions.sort((a, b) => Math.abs(b.value) - Math.abs(a.value));
  return { value, contributions };
}

export function scoreCandidate(
  media: Media,
  profile: TasteProfile,
  communityBoost: number
): ScoredCandidate {
  const { value: match, contributions } = tagMatch(media, profile);
  const qualityPrior = bayesianRating(media.averageScore, media.popularity);
  const base = W_MATCH * match + W_QUALITY * qualityPrior + W_COMMUNITY * communityBoost;
  return { media, base, tagMatch: match, qualityPrior, communityBoost, contributions };
}
