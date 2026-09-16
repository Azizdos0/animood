import { RESERVED_USERNAMES } from "@/lib/profile/username";

export type SlugError = "too_short" | "too_long" | "invalid_chars" | "reserved";
const EXTRA_RESERVED = new Set<string>(["new", "manage", "settings", "communities"]);

export function normalizeSlug(raw: string): string {
  return raw.trim().toLowerCase();
}

export function validateSlug(raw: string): { ok: true; value: string } | { ok: false; error: SlugError } {
  const value = normalizeSlug(raw);
  if (value.length < 3) return { ok: false, error: "too_short" };
  if (value.length > 30) return { ok: false, error: "too_long" };
  if (!/^[a-z0-9_-]+$/.test(value)) return { ok: false, error: "invalid_chars" };
  if (RESERVED_USERNAMES.has(value) || EXTRA_RESERVED.has(value)) return { ok: false, error: "reserved" };
  return { ok: true, value };
}
