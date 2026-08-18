import type { Media } from "@/lib/anilist/types";
import type { ListStatus } from "@/lib/list/schema";

export interface RatedTitle {
  media: Media;
  score: number | null;
  status: ListStatus;
}

export interface TagAffinity {
  tagId: number;
  name: string;
  affinity: number;
  count: number;
}

export interface TasteProfile {
  meanScore: number;
  ratedCount: number;
  tags: Record<number, TagAffinity>;
}
