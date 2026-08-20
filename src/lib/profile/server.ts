import type { ListEntry } from "@/lib/list/schema";
import type { CloudRow } from "@/lib/sync/types";
import { rowToEntry } from "@/lib/sync/merge";
import { supabaseServer } from "@/lib/supabase/server";
import { getProfileCard } from "@/lib/profile/queries";
import type { Profile } from "@/lib/profile/types";

export function entriesFromRows(rows: CloudRow[]): Record<number, ListEntry> {
  const out: Record<number, ListEntry> = {};
  for (const row of rows) {
    const { mediaId, entry } = rowToEntry(row);
    out[mediaId] = entry;
  }
  return out;
}

export type ProfilePageState =
  | { state: "not_found" }
  | { state: "private"; profile: Profile; isOwner: boolean }
  | { state: "ok"; profile: Profile; isOwner: boolean; entries: Record<number, ListEntry> };

export async function loadProfilePage(username: string): Promise<ProfilePageState> {
  const supabase = await supabaseServer();
  const profile = await getProfileCard(supabase as never, username);
  if (!profile) return { state: "not_found" };
  const { data } = await supabase.auth.getUser();
  const isOwner = data.user?.id === profile.userId;
  if (!profile.isPublic && !isOwner) return { state: "private", profile, isOwner };
  const { pullCloud } = await import("@/lib/sync/cloud");
  const rows = await pullCloud(supabase as never, profile.userId);
  return { state: "ok", profile, isOwner, entries: entriesFromRows(rows) };
}
