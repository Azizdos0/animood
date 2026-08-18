import {
  emptyStore, sanitizeStore, type ListEntry, type ListStoreV1,
} from "./schema";

export const LIST_STORAGE_KEY = "animood.list.v1";

const hasWindow = (): boolean => typeof window !== "undefined";

export function loadStore(): ListStoreV1 {
  if (!hasWindow()) return emptyStore();
  const raw = window.localStorage.getItem(LIST_STORAGE_KEY);
  if (!raw) return emptyStore();
  try {
    const parsed: unknown = JSON.parse(raw);
    return sanitizeStore(parsed);
  } catch {
    return emptyStore();
  }
}

export function saveStore(store: ListStoreV1): void {
  if (!hasWindow()) return;
  try {
    window.localStorage.setItem(LIST_STORAGE_KEY, JSON.stringify(store));
  } catch (err) {
    // QuotaExceededError, Safari private-mode, etc. — never let a write crash the caller.
    console.warn("animood: failed to persist list store", err);
  }
}

export function getEntry(mediaId: number): ListEntry | null {
  return loadStore().entries[mediaId] ?? null;
}

function clampScore(score: number | null): number | null {
  if (score === null || !Number.isFinite(score)) return null;
  return Math.round(Math.min(10, Math.max(1, score)));
}

function clampProgress(progress: number): number {
  if (!Number.isFinite(progress)) return 0;
  return Math.max(0, Math.round(progress));
}

export function upsertEntry(
  mediaId: number,
  patch: Partial<Omit<ListEntry, "updatedAt">>
): ListStoreV1 {
  const store = loadStore();
  const existing = store.entries[mediaId];
  const rawScore = patch.score !== undefined ? patch.score : existing?.score ?? null;
  const rawProgress = patch.progress ?? existing?.progress ?? 0;
  const merged: ListEntry = {
    status: patch.status ?? existing?.status ?? "planning",
    score: clampScore(rawScore),
    progress: clampProgress(rawProgress),
    updatedAt: new Date().toISOString(),
  };
  const next: ListStoreV1 = {
    version: store.version,
    entries: { ...store.entries, [mediaId]: merged },
  };
  saveStore(next);
  return next;
}

export function removeEntry(mediaId: number): ListStoreV1 {
  const store = loadStore();
  const entries = { ...store.entries };
  delete entries[mediaId];
  const next: ListStoreV1 = { version: store.version, entries };
  saveStore(next);
  return next;
}

export interface BulkImportItem {
  mediaId: number;
  status: ListEntry["status"];
  score: number | null;
  progress: number;
}

/**
 * Merge many entries in a single load/save. Imported items overwrite any
 * existing entry for the same media id. Returns the new store.
 */
export function bulkUpsert(items: BulkImportItem[]): ListStoreV1 {
  const store = loadStore();
  const now = new Date().toISOString();
  const entries = { ...store.entries };
  for (const item of items) {
    entries[item.mediaId] = {
      status: item.status,
      score: clampScore(item.score),
      progress: clampProgress(item.progress),
      updatedAt: now,
    };
  }
  const next: ListStoreV1 = { version: store.version, entries };
  saveStore(next);
  return next;
}

export function clearAll(): void {
  saveStore(emptyStore());
}
