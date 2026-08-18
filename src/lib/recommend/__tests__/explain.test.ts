import { describe, it, expect } from "vitest";
import { buildReason } from "@/lib/recommend/explain";
import type { ScoredCandidate } from "@/lib/recommend/scoring";

const cand: ScoredCandidate = {
  media: { id: 1 } as never, base: 5, tagMatch: 5, qualityPrior: 0, communityBoost: 0,
  contributions: [
    { tagId: 10, name: "Time Loop", value: 3 },
    { tagId: 20, name: "Psychological", value: 2 },
    { tagId: 30, name: "Boring", value: -4 },
    { tagId: 40, name: "Sci-Fi", value: 1 },
  ],
};

describe("buildReason", () => {
  it("returns the top positive tags only, capped", () => {
    const r = buildReason(cand, 2);
    expect(r.tags).toEqual(["Time Loop", "Psychological"]);
  });

  it("omits negative contributions", () => {
    expect(buildReason(cand).tags).not.toContain("Boring");
  });
});
