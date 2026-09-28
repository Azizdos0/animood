export type MediaType = "ANIME" | "MANGA";

export type MediaFormat =
  | "TV" | "TV_SHORT" | "MOVIE" | "SPECIAL" | "OVA" | "ONA"
  | "MUSIC" | "MANGA" | "NOVEL" | "ONE_SHOT";

export interface MediaTag {
  id: number;
  name: string;
  rank: number; // 0–100
}

export interface MediaStub {
  id: number;
  title: string;
  coverImage: string | null;
  format: MediaFormat | null;
}

export interface MediaRelationEdge {
  relationType: string; // e.g. "SEQUEL", "PREQUEL", "SIDE_STORY"
  node: MediaStub;
}

export interface Media {
  id: number;
  type: MediaType;
  title: string;
  coverImage: string | null;
  bannerImage: string | null;
  description: string | null;
  genres: string[];
  tags: MediaTag[];
  format: MediaFormat | null;
  episodes: number | null;
  chapters: number | null;
  averageScore: number | null; // 0–100 from AniList
  popularity: number;
  seasonYear: number | null;
  relations: MediaRelationEdge[];
  /** Absent on fixtures/older payloads; null when AniList reports none. */
  status?: MediaStatus | null;
  nextAiringEpisode?: NextAiringEpisode | null;
}

export type MediaStatus = "FINISHED" | "RELEASING" | "NOT_YET_RELEASED" | "CANCELLED" | "HIATUS";

export interface NextAiringEpisode {
  episode: number;
  /** Unix seconds. Absolute, so it stays correct however long the response was cached. */
  airingAt: number;
}

export interface MediaRecommendation {
  mediaId: number;
  rating: number; // community recommendation vote strength
  media: MediaStub;
}

export function isAnime(media: Media): boolean {
  return media.type === "ANIME";
}
