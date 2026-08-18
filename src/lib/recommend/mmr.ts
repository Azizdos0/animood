import type { Media } from "@/lib/anilist/types";
import type { ScoredCandidate } from "./scoring";

export function tagCosine(a: Media, b: Media): number {
  const va = new Map(a.tags.map((t) => [t.id, t.rank / 100]));
  const vb = new Map(b.tags.map((t) => [t.id, t.rank / 100]));
  let dot = 0;
  for (const [id, wa] of va) {
    const wb = vb.get(id);
    if (wb) dot += wa * wb;
  }
  const mag = (m: Map<number, number>) =>
    Math.sqrt([...m.values()].reduce((s, w) => s + w * w, 0));
  const denom = mag(va) * mag(vb);
  return denom === 0 ? 0 : dot / denom;
}

export function mmrRerank(
  candidates: ScoredCandidate[],
  lambda: number,
  topN: number
): ScoredCandidate[] {
  if (candidates.length === 0) return [];
  const bases = candidates.map((c) => c.base);
  const min = Math.min(...bases);
  const max = Math.max(...bases);
  const norm = (b: number) => (max === min ? 1 : (b - min) / (max - min));

  const remaining = [...candidates];
  const selected: ScoredCandidate[] = [];

  while (selected.length < topN && remaining.length > 0) {
    let bestIdx = 0;
    let bestScore = -Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const rel = norm(remaining[i].base);
      let maxSim = 0;
      for (const s of selected) {
        const sim = tagCosine(remaining[i].media, s.media);
        if (sim > maxSim) maxSim = sim;
      }
      const mmr = lambda * rel - (1 - lambda) * maxSim;
      if (mmr > bestScore) {
        bestScore = mmr;
        bestIdx = i;
      }
    }
    selected.push(remaining.splice(bestIdx, 1)[0]);
  }
  return selected;
}
