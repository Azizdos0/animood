import type { ListEntry } from "@/lib/list/schema";
import type { CloudRow } from "./merge";
import { entryToRow } from "./merge";

// Narrow structural type — the real Supabase client satisfies it.
export interface SupaLike {
  from(table: string): any; // eslint-disable-line @typescript-eslint/no-explicit-any
}

const TABLE = "list_entries";

export async function pullCloud(supabase: SupaLike, userId: string): Promise<CloudRow[]> {
  const { data, error } = await supabase.from(TABLE).select("*").eq("user_id", userId);
  if (error) throw error;
  return (data ?? []) as CloudRow[];
}

/**
 * Diff-based upsert: writes exactly the given rows (added/changed entries).
 * Never deletes — so one device's additions can never clobber another's.
 * No-op when there is nothing to push.
 */
export async function pushEntries(
  supabase: SupaLike,
  userId: string,
  entries: { mediaId: number; entry: ListEntry }[]
): Promise<void> {
  if (entries.length === 0) return;
  const rows = entries.map(({ mediaId, entry }) => entryToRow(userId, mediaId, entry));
  const up = await supabase.from(TABLE).upsert(rows, { onConflict: "user_id,media_id" });
  if (up?.error) throw up.error;
}

/**
 * Deletes only the specified rows (the user's own explicit removals).
 * No-op when there is nothing to delete.
 */
export async function deleteEntries(
  supabase: SupaLike,
  userId: string,
  mediaIds: number[]
): Promise<void> {
  if (mediaIds.length === 0) return;
  const del = await supabase.from(TABLE).delete().eq("user_id", userId).in("media_id", mediaIds);
  if (del?.error) throw del.error;
}
