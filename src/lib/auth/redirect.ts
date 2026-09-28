/** Only same-site paths are allowed as post-auth destinations; anything else
 * (absolute URLs, protocol-relative `//host`, or `/\host`, which browsers treat
 * as `//host`) falls back to the home page. */
export function safeNextPath(next: string | null | undefined): string {
  if (!next || !next.startsWith("/")) return "/";
  if (next.startsWith("//") || next.startsWith("/\\")) return "/";
  return next;
}
