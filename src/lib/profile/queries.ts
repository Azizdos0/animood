import type { SupaLike } from "@/lib/sync/cloud";
import type { Profile } from "./types";
import { validateUsername } from "./username";

const TABLE = "profiles";

interface ProfileRow {
  user_id: string; username: string; display_name: string | null;
  avatar_url: string | null; is_public: boolean; created_at: string;
}

export function profileRowToProfile(row: ProfileRow): Profile {
  return {
    userId: row.user_id, username: row.username, displayName: row.display_name,
    avatarUrl: row.avatar_url, isPublic: row.is_public, createdAt: row.created_at,
  };
}

export async function getProfileByUsername(supabase: SupaLike, username: string): Promise<Profile | null> {
  const { data, error } = await supabase.from(TABLE)
    .select("*").eq("username", username.trim().toLowerCase()).maybeSingle();
  if (error) throw error;
  return data ? profileRowToProfile(data as ProfileRow) : null;
}

export async function getProfileByUserId(supabase: SupaLike, userId: string): Promise<Profile | null> {
  const { data, error } = await supabase.from(TABLE)
    .select("*").eq("user_id", userId).maybeSingle();
  if (error) throw error;
  return data ? profileRowToProfile(data as ProfileRow) : null;
}

export async function createProfile(
  supabase: SupaLike,
  input: { userId: string; username: string; displayName: string | null; avatarUrl: string | null }
): Promise<{ ok: true; profile: Profile } | { ok: false; error: "taken" | "invalid" | "unknown" }> {
  const check = validateUsername(input.username);
  if (!check.ok) return { ok: false, error: "invalid" };
  const { data, error } = await supabase.from(TABLE).insert({
    user_id: input.userId, username: check.value,
    display_name: input.displayName, avatar_url: input.avatarUrl,
  }).select("*").maybeSingle();
  if (error) {
    if ((error as { code?: string }).code === "23505") return { ok: false, error: "taken" };
    return { ok: false, error: "unknown" };
  }
  return { ok: true, profile: profileRowToProfile(data as ProfileRow) };
}

export async function setProfileVisibility(supabase: SupaLike, userId: string, isPublic: boolean): Promise<void> {
  const { error } = await supabase.from(TABLE).update({ is_public: isPublic }).eq("user_id", userId);
  if (error) throw error;
}
