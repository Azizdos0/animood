import type { Media, MediaStub } from "./types";

export function relatedByType(media: Media, relationType: string): MediaStub[] {
  return media.relations
    .filter((r) => r.relationType === relationType)
    .map((r) => r.node);
}
