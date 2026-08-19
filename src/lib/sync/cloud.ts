import type { ListStoreV1 } from "@/lib/list/schema";
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

export async function reconcileCloud(
  supabase: SupaLike,
  userId: string,
  store: ListStoreV1
): Promise<void> {
  const rows = Object.entries(store.entries).map(([id, entry]) =>
    entryToRow(userId, Number(id), entry)
  );

  if (rows.length > 0) {
    const up = await supabase.from(TABLE).upsert(rows, { onConflict: "user_id,media_id" });
    if (up?.error) throw up.error;
    const ids = rows.map((r) => r.media_id).join(",");
    const del = await supabase
      .from(TABLE)
      .delete()
      .eq("user_id", userId)
      .not("media_id", "in", `(${ids})`);
    if (del?.error) throw del.error;
  } else {
    const del = await supabase.from(TABLE).delete().eq("user_id", userId);
    if (del?.error) throw del.error;
  }
}
