export type UsernameError = "too_short" | "too_long" | "invalid_chars" | "reserved";

export const RESERVED_USERNAMES = new Set<string>([
  "api", "u", "admin", "settings", "auth", "welcome", "login", "logout",
  "signin", "signout", "search", "stats", "my-list", "mylist",
  "recommendations", "import", "media", "home", "about", "help", "support",
  "null", "undefined", "animood",
]);

export function normalizeUsername(raw: string): string {
  return raw.trim().toLowerCase();
}

export function validateUsername(
  raw: string
): { ok: true; value: string } | { ok: false; error: UsernameError } {
  const value = normalizeUsername(raw);
  if (value.length < 3) return { ok: false, error: "too_short" };
  if (value.length > 20) return { ok: false, error: "too_long" };
  if (!/^[a-z0-9_]+$/.test(value)) return { ok: false, error: "invalid_chars" };
  if (RESERVED_USERNAMES.has(value)) return { ok: false, error: "reserved" };
  return { ok: true, value };
}
