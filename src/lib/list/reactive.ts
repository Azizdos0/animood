"use client";

import { useSyncExternalStore } from "react";
import { emptyStore, type ListEntry, type ListStoreV1 } from "./schema";
import { loadStore, upsertEntry, removeEntry } from "./storage";

let snapshot: ListStoreV1 | null = null;
const listeners = new Set<() => void>();

function current(): ListStoreV1 {
  if (snapshot === null) snapshot = loadStore();
  return snapshot;
}

function emit(): void {
  for (const l of listeners) l();
}

export function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

export function getSnapshot(): ListStoreV1 {
  return current();
}

export function getServerSnapshot(): ListStoreV1 {
  return emptyStore();
}

export function setEntry(
  mediaId: number,
  patch: Partial<Omit<ListEntry, "updatedAt">>
): void {
  snapshot = upsertEntry(mediaId, patch);
  emit();
}

export function deleteEntry(mediaId: number): void {
  snapshot = removeEntry(mediaId);
  emit();
}

export function useListStore(): ListStoreV1 {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

export function useListEntry(mediaId: number): ListEntry | null {
  const store = useListStore();
  return store.entries[mediaId] ?? null;
}

export function __resetListCacheForTests(): void {
  snapshot = null;
}
