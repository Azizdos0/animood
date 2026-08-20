export type ListStatus =
  | "watching" | "completed" | "planning" | "dropped" | "onhold";

export const LIST_STATUSES: ListStatus[] = [
  "watching", "completed", "planning", "dropped", "onhold",
];

export const CURRENT_LIST_VERSION = 1 as const;

export interface ListEntry {
  status: ListStatus;
  score: number | null; // 1–10 or null
  progress: number;      // >= 0
  updatedAt: string;     // ISO timestamp
  isFavorite: boolean;
}

export interface ListStoreV1 {
  version: 1;
  entries: Record<number, ListEntry>;
}

export function emptyStore(): ListStoreV1 {
  return { version: CURRENT_LIST_VERSION, entries: {} };
}

const NUMERIC_KEY_RE = /^\d+$/;

function isValidEntry(value: unknown): value is ListEntry {
  if (typeof value !== "object" || value === null) return false;
  const e = value as Record<string, unknown>;
  if (!LIST_STATUSES.includes(e.status as ListStatus)) return false;
  if (
    e.score !== null
    && (
      typeof e.score !== "number"
      || !Number.isFinite(e.score)
      || !Number.isInteger(e.score)
      || e.score < 1
      || e.score > 10
    )
  ) {
    return false;
  }
  if (
    typeof e.progress !== "number"
    || !Number.isFinite(e.progress)
    || !Number.isInteger(e.progress)
    || e.progress < 0
  ) {
    return false;
  }
  if (typeof e.updatedAt !== "string") return false;
  if (e.isFavorite !== undefined && typeof e.isFavorite !== "boolean") return false;
  return true;
}

export function isValidStore(value: unknown): value is ListStoreV1 {
  if (typeof value !== "object" || value === null) return false;
  const s = value as Record<string, unknown>;
  if (s.version !== CURRENT_LIST_VERSION) return false;
  if (typeof s.entries !== "object" || s.entries === null) return false;
  const entries = s.entries as Record<string, unknown>;
  const keys = Object.keys(entries);
  if (!keys.every((k) => NUMERIC_KEY_RE.test(k))) return false;
  return Object.values(entries).every(isValidEntry);
}

/**
 * Lenient load-path sanitizer: keeps only the entries that pass validation
 * and drops the rest, rather than discarding the entire store when a single
 * entry is invalid. Falls back to an empty store when the top-level shape
 * (version/entries) itself is not usable.
 */
export function sanitizeStore(value: unknown): ListStoreV1 {
  if (typeof value !== "object" || value === null) return emptyStore();
  const s = value as Record<string, unknown>;
  if (s.version !== CURRENT_LIST_VERSION) return emptyStore();
  if (typeof s.entries !== "object" || s.entries === null) return emptyStore();
  const rawEntries = s.entries as Record<string, unknown>;
  const entries: Record<number, ListEntry> = {};
  for (const key of Object.keys(rawEntries)) {
    if (!NUMERIC_KEY_RE.test(key)) continue;
    const candidate = rawEntries[key];
    if (isValidEntry(candidate)) {
      entries[Number(key)] = { ...candidate, isFavorite: (candidate as ListEntry).isFavorite === true };
    }
  }
  return { version: CURRENT_LIST_VERSION, entries };
}
