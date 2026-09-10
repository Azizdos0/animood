import {
  emptyStore, sanitizeStore, LIST_STATUSES, CURRENT_LIST_VERSION,
  type ListEntry, type ListStoreV1,
} from "./schema";
import { getListOwner, setListOwner } from "@/lib/sync/owner";
import { entryToRow, mergeLists } from "@/lib/sync/merge";

export const LIST_STORAGE_KEY = "animood.list.v1";
let activeAccount: string | null = null;

export function getListStorageScope(): string {
  return listStorageKey(activeAccount);
}

export function listStorageKey(userId: string | null): string {
  return userId === null ? LIST_STORAGE_KEY : `${LIST_STORAGE_KEY}.user:${encodeURIComponent(userId)}`;
}

/** Select a per-account namespace before doing any asynchronous work. */
export function activateListAccount(userId: string | null): void {
  activeAccount = userId;
  if (!hasWindow()) return;
  const raw = window.localStorage.getItem(LIST_STORAGE_KEY);
  const owner = getListOwner();
  if (!raw) { setListOwner(null); return; }
  const target = owner ?? userId;
  if (!target) return;

  // Upgrade the old shared slot, or claim a genuinely anonymous list once.
  // Mark ownership BEFORE copying so an interrupted migration cannot offer
  // this list to a different account. Never clear the source before saving.
  window.localStorage.setItem("animood.list.owner", target);
  const key = listStorageKey(target);
  const previous = readRecord(key);
  let legacy: ListStoreV1;
  try { legacy = sanitizeStore(JSON.parse(raw)); } catch { legacy = emptyStore(); }
  const merged = mergeLists(previous.store, Object.entries(legacy.entries)
    .map(([id, entry]) => entryToRow(target, Number(id), entry)));
  window.localStorage.setItem(key, JSON.stringify({ ...merged, synced: previous.synced, pendingIds: previous.pendingIds }));
  window.localStorage.removeItem(LIST_STORAGE_KEY);
  setListOwner(null);
}

const hasWindow = (): boolean => typeof window !== "undefined";

function readRecord(key: string): { store: ListStoreV1; synced: ListStoreV1; pendingIds: number[] } {
  try {
    const raw = hasWindow() ? window.localStorage.getItem(key) : null;
    const parsed = raw ? JSON.parse(raw) : null;
    return { store: sanitizeStore(parsed), synced: sanitizeStore(parsed?.synced),
      pendingIds: Array.isArray(parsed?.pendingIds)
        ? parsed.pendingIds.filter((id: unknown) => typeof id === "number" && Number.isInteger(id) && id > 0) : [] };
  } catch {
    return { store: emptyStore(), synced: emptyStore(), pendingIds: [] };
  }
}

export function loadStore(): ListStoreV1 {
  // Never expose an old account's shared-slot list while auth initializes.
  if (activeAccount === null && getListOwner() !== null) return emptyStore();
  return readRecord(listStorageKey(activeAccount)).store;
}

export function loadSyncBaseline(): ListStoreV1 {
  return readRecord(listStorageKey(activeAccount)).synced;
}

export function loadPendingIds(): number[] {
  return readRecord(listStorageKey(activeAccount)).pendingIds;
}

/** Store edits and their last acknowledged cloud state in one atomic write. */
export function saveSyncState(store: ListStoreV1, synced: ListStoreV1, pendingIds = loadPendingIds()): void {
  if (!hasWindow()) return;
  if (activeAccount === null && getListOwner() !== null) {
    throw new Error("Account list migration is pending");
  }
  const value = activeAccount === null ? store : { ...store, synced, pendingIds };
  window.localStorage.setItem(listStorageKey(activeAccount), JSON.stringify(value));
}

export function saveStore(store: ListStoreV1): void {
  if (!hasWindow()) return;
  try {
    saveSyncState(store, loadSyncBaseline());
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
    isFavorite: patch.isFavorite ?? existing?.isFavorite ?? false,
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
      isFavorite: false,
    };
  }
  const next: ListStoreV1 = { version: store.version, entries };
  saveStore(next);
  return next;
}

/**
 * Apply a full replacement store (e.g. from a merge resolution). Unlike
 * `bulkUpsert`, this preserves each entry's incoming `updatedAt` instead of
 * stamping `now` — merge timestamps must survive.
 */
export function replaceStore(store: ListStoreV1): ListStoreV1 {
  const entries: ListStoreV1["entries"] = {};
  for (const [key, value] of Object.entries(store.entries ?? {})) {
    const id = Number(key);
    if (!Number.isInteger(id)) continue;
    if (!LIST_STATUSES.includes(value.status)) continue;
    entries[id] = {
      status: value.status,
      score: clampScore(value.score),
      progress: clampProgress(value.progress),
      updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : new Date().toISOString(),
      isFavorite: value.isFavorite === true,
    };
  }
  const next: ListStoreV1 = { version: CURRENT_LIST_VERSION, entries };
  saveStore(next);
  return next;
}

export function clearAll(): void {
  saveStore(emptyStore());
}
