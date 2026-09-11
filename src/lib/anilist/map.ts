// Pure Jikan → Media mappers. No I/O, no dependencies.
import type { Media, MediaFormat, MediaRecommendation, MediaTag, MediaRelationEdge } from "@/lib/anilist/types";

// --- Raw Jikan shapes (only the fields we consume) --------------------------

export interface JikanImages {
  jpg?: {
    image_url?: string;
    small_image_url?: string;
    large_image_url?: string | null;
  } | null;
}

export interface JikanNamedEntity {
  mal_id: number;
  name: string;
}

export interface JikanRelationEntry {
  mal_id: number;
  type: string;
  name: string;
}

export interface JikanRelation {
  relation: string;
  entry: JikanRelationEntry[];
}

export interface JikanAnime {
  mal_id: number;
  title?: string | null;
  title_english?: string | null;
  type?: string | null;
  episodes?: number | null;
  score?: number | null;
  members?: number | null;
  popularity?: number | null;
  year?: number | null;
  synopsis?: string | null;
  images?: JikanImages | null;
  genres?: JikanNamedEntity[] | null;
  themes?: JikanNamedEntity[] | null;
  demographics?: JikanNamedEntity[] | null;
  aired?: { prop?: { from?: { year?: number | null } | null } | null } | null;
  relations?: JikanRelation[] | null;
}

export interface JikanRecommendationEntry {
  mal_id: number;
  title: string;
  images?: JikanImages | null;
}

export interface JikanRecommendationItem {
  entry: JikanRecommendationEntry;
  votes: number;
}

// --- Helpers ------------------------------------------------------------

export function pickTitle(raw: Pick<JikanAnime, "title" | "title_english">): string {
  return raw.title_english ?? raw.title ?? "Untitled";
}

export function mapFormat(type: string | null | undefined): MediaFormat | null {
  switch (type) {
    case "TV":
      return "TV";
    case "TV Special":
      return "SPECIAL";
    case "Movie":
      return "MOVIE";
    case "OVA":
      return "OVA";
    case "ONA":
      return "ONA";
    case "Special":
      return "SPECIAL";
    case "Music":
      return "MUSIC";
    default:
      return null;
  }
}

export function mapScore(score: number | null | undefined): number | null {
  return score == null ? null : Math.round(score * 10);
}

export function mapTags(
  themes: JikanNamedEntity[] | null | undefined,
  demographics: JikanNamedEntity[] | null | undefined
): MediaTag[] {
  return [...(themes ?? []), ...(demographics ?? [])].map((t) => ({
    id: t.mal_id,
    name: t.name,
    rank: 100,
  }));
}

export function normalizeRelation(relation: string): string {
  switch (relation) {
    case "Sequel":
      return "SEQUEL";
    case "Prequel":
      return "PREQUEL";
    case "Side Story":
    case "Side story":
      return "SIDE_STORY";
    case "Parent story":
      return "PARENT";
    case "Alternative version":
      return "ALTERNATIVE";
    default:
      return relation.toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  }
}

export function mapRelations(relations: JikanRelation[] | null | undefined): MediaRelationEdge[] {
  return (relations ?? []).flatMap((r) =>
    r.entry
      .filter((e) => e.type === "anime")
      .map((e) => ({
        relationType: normalizeRelation(r.relation),
        node: { id: e.mal_id, title: e.name, coverImage: null, format: null },
      }))
  );
}

// --- Mappers --------------------------------------------------------------

export function mapAnime(raw: JikanAnime): Media {
  return {
    id: raw.mal_id,
    type: "ANIME",
    title: pickTitle(raw),
    coverImage: raw.images?.jpg?.large_image_url ?? null,
    bannerImage: null,
    description: raw.synopsis ?? null,
    genres: (raw.genres ?? []).map((g) => g.name),
    tags: mapTags(raw.themes, raw.demographics),
    format: mapFormat(raw.type),
    episodes: raw.episodes ?? null,
    chapters: null,
    averageScore: mapScore(raw.score),
    popularity: raw.members ?? 0,
    seasonYear: raw.year ?? raw.aired?.prop?.from?.year ?? null,
    relations: mapRelations(raw.relations),
  };
}

export const mapSearchItem = mapAnime;

export function mapRecommendationEntry(raw: JikanRecommendationItem): MediaRecommendation {
  return {
    mediaId: raw.entry.mal_id,
    rating: raw.votes,
    media: {
      id: raw.entry.mal_id,
      title: raw.entry.title,
      coverImage: raw.entry.images?.jpg?.large_image_url ?? null,
      format: null,
    },
  };
}
