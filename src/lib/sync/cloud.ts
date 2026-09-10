import type { ListEntry } from "@/lib/list/schema";
import type { CloudRow } from "./merge";
import { entryToRow } from "./merge";

// Narrow structural type — the real Supabase client satisfies it.
export interface SupaLike {
  from(table: string): any; // eslint-disable-line @typescript-eslint/no-explicit-any
  rpc(fn: string, args?: unknown): any; // eslint-disable-line @typescript-eslint/no-explicit-any
}

const TABLE = "list_entries";

export async function pullCloud(supabase: SupaLike, userId: string, signal?: AbortSignal): Promise<CloudRow[]> {
  const rows: CloudRow[] = [];
  let after = 0;
  for (;;) {
    let query = supabase.from(TABLE).select("*").eq("user_id", userId)
      .order("media_id", { ascending: true }).limit(1000);
    if (after) query = query.gt("media_id", after);
    if (signal) query = query.abortSignal(signal);
    const { data, error } = await query;
    if (error) throw error;
    const page = (data ?? []) as CloudRow[];
    if (!page.length) return rows;
    const next = page[page.length - 1].media_id;
    if (next <= after) throw new Error("Cloud list pagination did not advance");
    rows.push(...page);
    after = next;
    // Continue even if the project's row cap is lower than our page size.
  }
}

/**
 * Diff-based upsert: writes exactly the given rows (added/changed entries).
 * Never deletes — so one device's additions can never clobber another's.
 * No-op when there is nothing to push.
 */
export async function pushEntries(
  supabase: SupaLike,
  userId: string,
  entries: { mediaId: number; entry: ListEntry }[],
  signal?: AbortSignal,
): Promise<void> {
  if (entries.length === 0) return;
  const rows = entries.map(({ mediaId, entry }) => entryToRow(userId, mediaId, entry));
  let query = supabase.from(TABLE).upsert(rows, { onConflict: "user_id,media_id" });
  if (signal) query = query.abortSignal(signal);
  const up = await query;
  if (up?.error) throw up.error;
}

/**
 * Deletes only the specified rows (the user's own explicit removals).
 * No-op when there is nothing to delete.
 */
export async function deleteEntries(
  supabase: SupaLike,
  userId: string,
  mediaIds: number[],
  signal?: AbortSignal,
): Promise<void> {
  if (mediaIds.length === 0) return;
  let query = supabase.from(TABLE).delete().eq("user_id", userId).in("media_id", mediaIds);
  if (signal) query = query.abortSignal(signal);
  const del = await query;
  if (del?.error) throw del.error;
}
