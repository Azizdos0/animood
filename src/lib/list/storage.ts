import {
  emptyStore, isValidStore, type ListEntry, type ListStoreV1,
} from "./schema";

export const LIST_STORAGE_KEY = "animood.list.v1";

const hasWindow = (): boolean => typeof window !== "undefined";

export function loadStore(): ListStoreV1 {
  if (!hasWindow()) return emptyStore();
  const raw = window.localStorage.getItem(LIST_STORAGE_KEY);
  if (!raw) return emptyStore();
  try {
    const parsed: unknown = JSON.parse(raw);
    return isValidStore(parsed) ? parsed : emptyStore();
  } catch {
    return emptyStore();
  }
}

export function saveStore(store: ListStoreV1): void {
  if (!hasWindow()) return;
  window.localStorage.setItem(LIST_STORAGE_KEY, JSON.stringify(store));
}

export function getEntry(mediaId: number): ListEntry | null {
  return loadStore().entries[mediaId] ?? null;
}

export function upsertEntry(
  mediaId: number,
  patch: Partial<Omit<ListEntry, "updatedAt">>
): ListStoreV1 {
  const store = loadStore();
  const existing = store.entries[mediaId];
  const merged: ListEntry = {
    status: patch.status ?? existing?.status ?? "planning",
    score: patch.score !== undefined ? patch.score : existing?.score ?? null,
    progress: patch.progress ?? existing?.progress ?? 0,
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

export function clearAll(): void {
  saveStore(emptyStore());
}
