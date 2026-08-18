import type { Media } from "@/lib/anilist/types";
import type { RatedTitle, TasteProfile } from "./types";
import { buildTasteProfile } from "./profile";
import { scoreCandidate, type ScoredCandidate } from "./scoring";
import { isUnwatchedSequel } from "./filters";

export function assemblePool(args: {
  rated: RatedTitle[];
  candidateMedia: Media[];
  communityRaw: { candidateId: number; rating: number; sourceScoreSignal: number }[];
  listedIds: Set<number>;
}): { profile: TasteProfile; pool: ScoredCandidate[] } {
  const { rated, candidateMedia, communityRaw, listedIds } = args;
  const profile = buildTasteProfile(rated);

  // Aggregate raw community weight per candidate (positive source signal only).
  const rawBoost = new Map<number, number>();
  for (const c of communityRaw) {
    if (c.sourceScoreSignal <= 0) continue;
    rawBoost.set(c.candidateId, (rawBoost.get(c.candidateId) ?? 0) + c.rating * c.sourceScoreSignal);
  }
  const maxBoost = Math.max(0, ...rawBoost.values());
  const boostOf = (id: number) =>
    maxBoost > 0 ? (rawBoost.get(id) ?? 0) / maxBoost : 0;

  const pool = candidateMedia
    .filter((m) => !listedIds.has(m.id))
    .filter((m) => !isUnwatchedSequel(m, listedIds)) // smart sequel handling (spec §4)
    .map((m) => scoreCandidate(m, profile, boostOf(m.id)))
    .sort((a, b) => b.base - a.base);

  return { profile, pool };
}
