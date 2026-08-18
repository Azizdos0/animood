import type { ScoredCandidate } from "./scoring";

export interface RecommendationReason {
  tags: string[];
}

export function buildReason(candidate: ScoredCandidate, maxTags = 3): RecommendationReason {
  const tags = candidate.contributions
    .filter((c) => c.value > 0)
    .slice(0, maxTags)
    .map((c) => c.name);
  return { tags };
}
