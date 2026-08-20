import type { ListEntry, ListStoreV1 } from "@/lib/list/schema";
import { CURRENT_LIST_VERSION } from "@/lib/list/schema";
import type { CloudRow } from "./types";

export type { CloudRow };

export function rowToEntry(row: CloudRow): { mediaId: number; entry: ListEntry } {
  return {
    mediaId: row.media_id,
    entry: {
      status: row.status,
      score: row.score,
      progress: row.progress,
      updatedAt: row.updated_at,
    },
  };
}

export function entryToRow(userId: string, mediaId: number, entry: ListEntry): CloudRow {
  return {
    user_id: userId,
    media_id: mediaId,
    status: entry.status,
    score: entry.score,
    progress: entry.progress,
    updated_at: entry.updatedAt,
  };
}

export function mergeLists(local: ListStoreV1, cloud: CloudRow[]): ListStoreV1 {
  const entries: ListStoreV1["entries"] = { ...local.entries };
  for (const row of cloud) {
    const { mediaId, entry } = rowToEntry(row);
    const existing = entries[mediaId];
    if (
      !existing
      || new Date(row.updated_at).getTime() > new Date(existing.updatedAt).getTime()
    ) {
      entries[mediaId] = entry;
    }
  }
  return { version: CURRENT_LIST_VERSION, entries };
}
