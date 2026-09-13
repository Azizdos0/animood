// Cache-first, Jikan-backed catalog layer. Public signatures are unchanged
// from the old AniList implementation so every consumer keeps compiling.
import { jikanRequest, JikanError } from "./jikan";
import type { JikanAnime, JikanRecommendationItem } from "./map";
import { mapAnime, mapRecommendationEntry } from "./map";
import { readCache, writeCache } from "./cache";
import { genreId } from "./genres";
import { supabaseServer } from "@/lib/supabase/server";
import type { Media, MediaFormat, MediaRecommendation, MediaType } from "./types";

// --- Jikan response envelopes ---------------------------------------------
interface JikanSingle {
  data: JikanAnime;
}
interface JikanList {
  data: JikanAnime[];
  pagination?: { has_next_page?: boolean };
}
interface JikanRecList {
  data: JikanRecommendationItem[];
}

// Reads use the anon server client. Any cache failure (misconfig, network,
// RLS) falls back to live Jikan rather than surfacing an error.
async function readCacheSafe(ids: number[]): Promise<Media[]> {
  try {
    const supabase = await supabaseServer();
    return await readCache(supabase, ids);
  } catch {
    return [];
  }
}

const fetchFull = (id: number) => jikanRequest<JikanSingle>(`/anime/${id}/full`);

export async function getMediaById(id: number): Promise<Media | null> {
  const [hit] = await readCacheSafe([id]);
  if (hit) return hit;
  try {
    const media = mapAnime((await fetchFull(id)).data);
    await writeCache([media]);
    return media;
  } catch (err) {
    if (err instanceof JikanError) return null;
    throw err;
  }
}

export async function getMediaByIds(ids: number[]): Promise<Media[]> {
  if (ids.length === 0) return [];

  const hits = await readCacheSafe(ids);
  const hitIds = new Set(hits.map((m) => m.id));
  const misses = ids.filter((id) => !hitIds.has(id));

  // Partial-tolerant: a miss whose fetch throws is skipped, not fatal.
  const settled = await Promise.all(
    misses.map((id) =>
      fetchFull(id)
        .then((body) => mapAnime(body.data))
        .catch(() => null)
    )
  );
  const fetched = settled.filter((m): m is Media => m !== null);

  await writeCache(fetched);
  return [...hits, ...fetched];
}

const SORT_MAP: Record<string, { order_by: string; sort: string }> = {
  POPULARITY_DESC: { order_by: "members", sort: "desc" },
  SCORE_DESC: { order_by: "score", sort: "desc" },
  // Jikan has no exact "trending" sort — approximate with the popularity default.
  TRENDING_DESC: { order_by: "members", sort: "desc" },
};
const DEFAULT_SORT = { order_by: "members", sort: "desc" };

// Our MediaFormat → Jikan `/anime?type=`. Manga formats have no anime type.
const FORMAT_TYPE: Partial<Record<MediaFormat, string>> = {
  TV: "tv",
  TV_SHORT: "tv",
  MOVIE: "movie",
  OVA: "ova",
  ONA: "ona",
  SPECIAL: "special",
  MUSIC: "music",
};

export async function searchMedia(params: {
  search?: string;
  type: MediaType;
  genre?: string;
  format?: MediaFormat;
  seasonYear?: number;
  sort?: string;
  page?: number;
  perPage?: number;
}): Promise<{ items: Media[]; hasNextPage: boolean }> {
  // Jikan is anime-only in this catalog; MANGA yields nothing.
  if (params.type === "MANGA") return { items: [], hasNextPage: false };

  const qs = new URLSearchParams();
  if (params.search) qs.set("q", params.search);
  const gid = genreId(params.genre);
  if (gid !== undefined) qs.set("genres", String(gid));
  const jikanType = params.format ? FORMAT_TYPE[params.format] : undefined;
  if (jikanType) qs.set("type", jikanType);
  const { order_by, sort } = SORT_MAP[params.sort ?? ""] ?? DEFAULT_SORT;
  qs.set("order_by", order_by);
  qs.set("sort", sort);
  qs.set("page", String(params.page ?? 1));
  qs.set("limit", String(params.perPage ?? 24));

  const body = await jikanRequest<JikanList>(`/anime?${qs.toString()}`);
  const items = (body.data ?? []).map(mapAnime);
  await writeCache(items); // best-effort warm
  return { items, hasNextPage: body.pagination?.has_next_page ?? false };
}

export async function getTrending(type: MediaType, perPage = 20): Promise<Media[]> {
  if (type === "MANGA") return [];
  const body = await jikanRequest<JikanList>(
    `/top/anime?filter=bypopularity&limit=${perPage}`
  );
  const items = (body.data ?? []).map(mapAnime);
  await writeCache(items); // best-effort warm
  return items;
}

export async function getRecommendationsFor(
  mediaId: number,
  perPage = 25
): Promise<MediaRecommendation[]> {
  try {
    const body = await jikanRequest<JikanRecList>(`/anime/${mediaId}/recommendations`);
    return (body.data ?? []).slice(0, perPage).map(mapRecommendationEntry);
  } catch {
    return [];
  }
}

export interface MalMediaStub {
  id: number;
  idMal: number | null;
  title: string;
  coverImage: string | null;
  format: MediaFormat | null;
}

export async function getMediaByMalIds(
  malIds: number[],
  type: MediaType
): Promise<MalMediaStub[]> {
  if (type === "MANGA") return [];
  if (malIds.length === 0) return [];
  // MAL ids are already canonical, so id === idMal.
  const media = await getMediaByIds(malIds);
  return media.map((m) => ({
    id: m.id,
    idMal: m.id,
    title: m.title,
    coverImage: m.coverImage,
    format: m.format,
  }));
}
