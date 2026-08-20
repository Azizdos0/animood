const OWNER_KEY = "animood.list.owner";

/**
 * Returns the userId that currently owns the local list, or null when the
 * list is anonymous (no signed-in owner). SSR-safe: returns null when there
 * is no `window`.
 */
export function getListOwner(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(OWNER_KEY);
  } catch {
    return null;
  }
}

/**
 * Tags the local list with an owning userId, or clears the tag (anonymous)
 * when passed null. SSR-safe: no-op when there is no `window`.
 */
export function setListOwner(userId: string | null): void {
  if (typeof window === "undefined") return;
  try {
    if (userId === null) {
      window.localStorage.removeItem(OWNER_KEY);
    } else {
      window.localStorage.setItem(OWNER_KEY, userId);
    }
  } catch {
    // storage unavailable (private mode / quota) — best effort only.
  }
}
