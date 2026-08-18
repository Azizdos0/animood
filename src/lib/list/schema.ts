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
}

export interface ListStoreV1 {
  version: 1;
  entries: Record<number, ListEntry>;
}

export function emptyStore(): ListStoreV1 {
  return { version: CURRENT_LIST_VERSION, entries: {} };
}

function isValidEntry(value: unknown): value is ListEntry {
  if (typeof value !== "object" || value === null) return false;
  const e = value as Record<string, unknown>;
  if (!LIST_STATUSES.includes(e.status as ListStatus)) return false;
  if (e.score !== null && (typeof e.score !== "number" || e.score < 1 || e.score > 10)) {
    return false;
  }
  if (typeof e.progress !== "number" || e.progress < 0) return false;
  if (typeof e.updatedAt !== "string") return false;
  return true;
}

export function isValidStore(value: unknown): value is ListStoreV1 {
  if (typeof value !== "object" || value === null) return false;
  const s = value as Record<string, unknown>;
  if (s.version !== CURRENT_LIST_VERSION) return false;
  if (typeof s.entries !== "object" || s.entries === null) return false;
  return Object.values(s.entries as Record<string, unknown>).every(isValidEntry);
}
