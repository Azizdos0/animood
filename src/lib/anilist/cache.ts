import type { SupaLike } from "@/lib/sync/cloud";
import type { Media } from "@/lib/anilist/types";
import { isServiceConfigured, supabaseService } from "@/lib/supabase/service";

export async function readCache(supabase: SupaLike, malIds: number[]): Promise<Media[]> {
  if (malIds.length === 0) return [];
  const { data, error } = await supabase
    .from("media_cache")
    .select("media")
    .eq("type", "anime")
    .in("mal_id", malIds);
  if (error) throw error;
  const rows = (data ?? []) as { media: unknown }[];
  return rows.map((r) => r.media as Media);
}

export async function writeCache(media: Media[]): Promise<void> {
  if (media.length === 0) return;
  if (!isServiceConfigured()) return;
  try {
    await supabaseService().rpc("upsert_media_cache", {
      p_rows: media.map((m) => ({ mal_id: m.id, type: "anime", media: m })),
    });
  } catch (err) {
    console.warn("writeCache: media_cache upsert failed", err);
  }
}
