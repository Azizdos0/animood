import { anilistRequest } from "./client";
import {
  MEDIA_BY_ID_QUERY, MEDIA_BY_IDS_QUERY, RECOMMENDATIONS_QUERY, SEARCH_QUERY, TRENDING_QUERY,
} from "./queries";
import type {
  Media, MediaFormat, MediaRecommendation, MediaStub, MediaType,
} from "./types";

interface RawTitle { romaji: string | null; english: string | null; native?: string | null }
interface RawStub {
  id: number; title: RawTitle; coverImage: { large: string | null } | null;
  format: MediaFormat | null;
}
export interface RawMedia extends RawStub {
  type: MediaType;
  bannerImage: string | null;
  description: string | null;
  genres: string[];
  tags: { id: number; name: string; rank: number }[];
  episodes: number | null;
  chapters: number | null;
  averageScore: number | null;
  popularity: number;
  seasonYear: number | null;
  relations: { edges: { relationType: string; node: RawStub }[] };
}

const pickTitle = (t: RawTitle): string => t.english ?? t.romaji ?? t.native ?? "Untitled";
const mapStub = (s: RawStub): MediaStub => ({
  id: s.id, title: pickTitle(s.title),
  coverImage: s.coverImage?.large ?? null, format: s.format,
});

export function mapMedia(raw: RawMedia): Media {
  return {
    id: raw.id,
    type: raw.type,
    title: pickTitle(raw.title),
    coverImage: raw.coverImage?.large ?? null,
    bannerImage: raw.bannerImage,
    description: raw.description,
    genres: raw.genres ?? [],
    tags: (raw.tags ?? []).map((t) => ({ id: t.id, name: t.name, rank: t.rank })),
    format: raw.format,
    episodes: raw.episodes,
    chapters: raw.chapters,
    averageScore: raw.averageScore,
    popularity: raw.popularity ?? 0,
    seasonYear: raw.seasonYear,
    relations: (raw.relations?.edges ?? []).map((e) => ({
      relationType: e.relationType, node: mapStub(e.node),
    })),
  };
}

export async function searchMedia(params: {
  search?: string; type: MediaType; genre?: string; format?: MediaFormat;
  seasonYear?: number; sort?: string; page?: number; perPage?: number;
}): Promise<{ items: Media[]; hasNextPage: boolean }> {
  const data = await anilistRequest<{
    Page: { pageInfo: { hasNextPage: boolean }; media: RawMedia[] };
  }>(SEARCH_QUERY, {
    search: params.search || undefined,
    type: params.type,
    genre: params.genre || undefined,
    format: params.format || undefined,
    seasonYear: params.seasonYear || undefined,
    sort: params.sort ? [params.sort] : ["POPULARITY_DESC"],
    page: params.page ?? 1,
    perPage: params.perPage ?? 24,
  });
  return {
    items: data.Page.media.map(mapMedia),
    hasNextPage: data.Page.pageInfo.hasNextPage,
  };
}

export async function getMediaById(id: number): Promise<Media | null> {
  const data = await anilistRequest<{ Media: RawMedia | null }>(MEDIA_BY_ID_QUERY, { id });
  return data.Media ? mapMedia(data.Media) : null;
}

export async function getTrending(type: MediaType, perPage = 20): Promise<Media[]> {
  const data = await anilistRequest<{ Page: { media: RawMedia[] } }>(
    TRENDING_QUERY, { type, perPage }
  );
  return data.Page.media.map(mapMedia);
}

export async function getRecommendationsFor(
  mediaId: number, perPage = 25
): Promise<MediaRecommendation[]> {
  const data = await anilistRequest<{
    Media: { recommendations: { nodes: {
      rating: number; mediaRecommendation: RawStub | null;
    }[] } } | null;
  }>(RECOMMENDATIONS_QUERY, { mediaId, perPage });

  const nodes = data.Media?.recommendations.nodes ?? [];
  return nodes
    .filter((n) => n.mediaRecommendation !== null)
    .map((n) => ({
      mediaId: n.mediaRecommendation!.id,
      rating: n.rating,
      media: mapStub(n.mediaRecommendation!),
    }));
}

export async function getMediaByIds(ids: number[]): Promise<Media[]> {
  if (ids.length === 0) return [];
  const chunks: number[][] = [];
  for (let i = 0; i < ids.length; i += 50) chunks.push(ids.slice(i, i + 50));

  const results = await Promise.all(
    chunks.map((chunk) =>
      anilistRequest<{ Page: { media: RawMedia[] } }>(MEDIA_BY_IDS_QUERY, {
        ids: chunk,
        perPage: 50,
      })
    )
  );
  return results.flatMap((r) => r.Page.media.map(mapMedia));
}
