import type { Media } from "@/lib/anilist/types";
import type { ListEntry } from "@/lib/list/schema";

export interface StatEntry {
  media: Media;
  entry: ListEntry;
}
