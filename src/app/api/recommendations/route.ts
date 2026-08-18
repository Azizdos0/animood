import { getMediaByIds, getRecommendationsFor } from "@/lib/anilist/media";
import type { Media } from "@/lib/anilist/types";
import type { ListStatus } from "@/lib/list/schema";
import { assemblePool } from "@/lib/recommend/engine";
import { NEUTRAL_MEAN } from "@/lib/recommend/constants";
import type { RatedTitle } from "@/lib/recommend/types";

interface ListInput { id: number; score: number | null; status: ListStatus }

const TOP_SOURCES = 15;   // fetch community recs for this many top-rated titles
const MAX_CANDIDATES = 80;

export async function POST(request: Request): Promise<Response> {
  let list: ListInput[] = [];
  try {
    const body = (await request.json()) as { list?: ListInput[] };
    list = Array.isArray(body.list) ? body.list : [];
  } catch {
    return Response.json({ profile: null, pool: [], coldStart: true });
  }

  const scored = list.filter((e) => e.score !== null);
  if (scored.length === 0) {
    return Response.json({ profile: null, pool: [], coldStart: true });
  }

  try {
    const listedIds = new Set(list.map((e) => e.id));
    const ratedMedia = await getMediaByIds(list.map((e) => e.id));
    const mediaById = new Map(ratedMedia.map((m) => [m.id, m]));

    const rated: RatedTitle[] = list
      .map((e) => {
        const media = mediaById.get(e.id);
        return media ? { media, score: e.score, status: e.status } : null;
      })
      .filter((x): x is RatedTitle => x !== null);

    // Mean for source-signal weighting of community recs.
    const mean =
      scored.length >= 2
        ? scored.reduce((s, e) => s + (e.score as number), 0) / scored.length
        : NEUTRAL_MEAN;

    const topSources = [...rated]
      .filter((r) => r.score !== null)
      .sort((a, b) => (b.score as number) - (a.score as number))
      .slice(0, TOP_SOURCES);

    const recLists = await Promise.all(
      topSources.map(async (src) => ({
        signal: (src.score as number) - mean,
        recs: await getRecommendationsFor(src.media.id),
      }))
    );

    const communityRaw: { candidateId: number; rating: number; sourceScoreSignal: number }[] = [];
    const candidateIds = new Set<number>();
    for (const { signal, recs } of recLists) {
      for (const rec of recs) {
        if (listedIds.has(rec.mediaId)) continue;
        communityRaw.push({ candidateId: rec.mediaId, rating: rec.rating, sourceScoreSignal: signal });
        candidateIds.add(rec.mediaId);
      }
    }

    const candidateMedia: Media[] =
      candidateIds.size > 0
        ? await getMediaByIds([...candidateIds].slice(0, MAX_CANDIDATES))
        : [];

    const { profile, pool } = assemblePool({ rated, candidateMedia, communityRaw, listedIds });
    return Response.json({ profile, pool, coldStart: false });
  } catch {
    return Response.json({ profile: null, pool: [], error: "fetch_failed" }, { status: 502 });
  }
}
