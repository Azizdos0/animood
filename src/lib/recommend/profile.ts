import type { RatedTitle, TasteProfile, TagAffinity } from "./types";
import { DROPPED_SIGNAL, NEUTRAL_MEAN, SHRINKAGE_K } from "./constants";

export function buildTasteProfile(titles: RatedTitle[]): TasteProfile {
  const scored = titles.filter((t) => t.score !== null);
  const meanScore =
    scored.length >= 2
      ? scored.reduce((s, t) => s + (t.score as number), 0) / scored.length
      : NEUTRAL_MEAN;

  const acc = new Map<number, { name: string; weightedSum: number; weight: number; count: number }>();

  for (const t of titles) {
    let signal: number | null = null;
    if (t.score !== null) signal = t.score - meanScore;
    else if (t.status === "dropped") signal = DROPPED_SIGNAL;
    if (signal === null) continue;

    for (const tag of t.media.tags ?? []) {
      const w = tag.rank / 100;
      if (w <= 0) continue;
      const cur = acc.get(tag.id) ?? { name: tag.name, weightedSum: 0, weight: 0, count: 0 };
      cur.weightedSum += signal * w;
      cur.weight += w;
      cur.count += 1;
      acc.set(tag.id, cur);
    }
  }

  const tags: Record<number, TagAffinity> = {};
  for (const [tagId, v] of acc) {
    const raw = v.weight > 0 ? v.weightedSum / v.weight : 0;
    const shrunk = raw * (v.count / (v.count + SHRINKAGE_K));
    tags[tagId] = { tagId, name: v.name, affinity: shrunk, count: v.count };
  }

  return { meanScore, ratedCount: scored.length, tags };
}
