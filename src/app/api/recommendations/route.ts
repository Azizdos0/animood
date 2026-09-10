import { getMediaByIds, getRecommendationsFor, searchMedia } from "@/lib/anilist/media";
import type { Media } from "@/lib/anilist/types";
import { LIST_STATUSES, type ListStatus } from "@/lib/list/schema";
import { assemblePool } from "@/lib/recommend/engine";
import { NEUTRAL_MEAN } from "@/lib/recommend/constants";
import { getMood } from "@/lib/recommend/moods";
import type { RatedTitle } from "@/lib/recommend/types";

interface ListInput { id: number; score: number | null; status: ListStatus }
const positiveId = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value > 0;
function validEntry(value: unknown): value is ListInput {
  if (!value || typeof value !== "object") return false;
  const e = value as ListInput;
  return positiveId(e.id) && LIST_STATUSES.includes(e.status)
    && (e.score === null || (Number.isInteger(e.score) && e.score >= 1 && e.score <= 10));
}

export async function POST(request: Request): Promise<Response> {
  let body: { list?: unknown; seeds?: unknown; mood?: unknown; type?: unknown };
  try {
    body = await request.json();
    if (!body || typeof body !== "object") throw new Error();
  } catch { return Response.json({ error: "invalid_request" }, { status: 400 }); }
  const list = body.list ?? [];
  const seeds = body.seeds ?? [];
  const mood = getMood(body.mood);
  if (!Array.isArray(list) || list.length > 5000 || !list.every(validEntry)
    || !Array.isArray(seeds) || seeds.length > 3 || !seeds.every(positiveId)
    || (body.mood != null && !mood)
    || (body.type != null && body.type !== "ANIME" && body.type !== "MANGA")) {
    return Response.json({ error: "invalid_request" }, { status: 400 });
  }
  const type = body.type === "MANGA" ? "MANGA" : "ANIME";
  const uniqueList = [...new Map(list.map(e => [e.id, e])).values()];
  const tasteEntries = uniqueList.filter(e => e.score !== null || e.status === "dropped");
  const tasteIds = [...new Set([...tasteEntries.map(e => e.id), ...seeds])];
  const genres = mood ? [...mood.genres] : [undefined];

  try {
    // Genre pools give every mood coverage, even without ratings or community recs.
    const [tasteResult, ...browseResults] = await Promise.allSettled([
      tasteIds.length ? getMediaByIds(tasteIds) : Promise.resolve([] as Media[]),
      ...genres.map(genre => searchMedia({ type, genre, sort: "POPULARITY_DESC", perPage: 40 }).then(r => r.items)),
    ]);
    let partial = tasteResult.status === "rejected" || browseResults.some(r => r.status === "rejected");
    const tasteMedia = tasteResult.status === "fulfilled" ? tasteResult.value : [];
    const byId = new Map(tasteMedia.map(m => [m.id, m]));
    const rated: RatedTitle[] = tasteEntries.flatMap(e => {
      const media = byId.get(e.id);
      return media ? [{ media, score: e.score, status: e.status }] : [];
    });
    for (const id of new Set<number>(seeds)) {
      const media = byId.get(id);
      if (media && !rated.some(r => r.media.id === id)) {
        rated.push({ media, score: null, status: "completed", preference: "liked" });
      }
    }
    const scores = rated.flatMap(r => r.score === null ? [] : [r.score]);
    const mean = scores.length >= 2 ? scores.reduce((a, b) => a + b, 0) / scores.length : NEUTRAL_MEAN;
    const sources = rated.filter(r => r.score !== null || r.preference === "liked")
      .sort((a, b) => (b.score ?? 9) - (a.score ?? 9)).slice(0, 6);
    const communityResults = await Promise.allSettled(sources.map(async source => ({
      signal: source.preference === "liked" ? 3 : source.score! - mean,
      recs: await getRecommendationsFor(source.media.id),
    })));
    partial ||= communityResults.some(r => r.status === "rejected");
    const listedIds = new Set([...uniqueList.map(e => e.id), ...seeds]);
    const communityRaw: { candidateId: number; rating: number; sourceScoreSignal: number }[] = [];
    const ids = new Set<number>();
    for (const result of communityResults) {
      if (result.status !== "fulfilled") continue;
      for (const rec of result.value.recs) {
        if (listedIds.has(rec.mediaId)) continue;
        ids.add(rec.mediaId);
        communityRaw.push({ candidateId: rec.mediaId, rating: rec.rating, sourceScoreSignal: result.value.signal });
      }
    }
    const candidates = new Map<number, Media>();
    for (const result of browseResults) {
      if (result.status === "fulfilled") for (const item of result.value) candidates.set(item.id, item);
    }
    if (ids.size) {
      try { for (const item of await getMediaByIds([...ids].slice(0, 80))) candidates.set(item.id, item); }
      catch { partial = true; }
    }
    if (!candidates.size && browseResults.every(r => r.status === "rejected")) {
      return Response.json({ error: "fetch_failed" }, { status: 502 });
    }
    const { profile, pool } = assemblePool({ rated,
      candidateMedia: [...candidates.values()].filter(m => m.type === type), communityRaw, listedIds });
    return Response.json({ profile, pool, coldStart: rated.length === 0, partial });
  } catch { return Response.json({ error: "fetch_failed" }, { status: 502 }); }
}
