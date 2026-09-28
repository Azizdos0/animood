"use client";

import { useSyncExternalStore } from "react";
import { subscribe as subscribeList } from "@/lib/list/reactive";
import { getListStorageScope, listStorageKey } from "@/lib/list/storage";

export interface FavoriteSeed { id: number; title: string; coverImage: string | null }
export interface Preferences {
  seeds: FavoriteSeed[];
  hiddenIds: number[];
  diversity: number;
  excludedGenres: string[];
}
interface Snapshot extends Preferences { scope: string }
const EMPTY: Snapshot = { scope: "server", seeds: [], hiddenIds: [], diversity: 0.3, excludedGenres: [] };
const EVENT = "animood:discovery";
let cache: { key: string; raw: string | null; value: Snapshot } | null = null;
const validId = (id: unknown): id is number => typeof id === "number" && Number.isSafeInteger(id) && id > 0;

export function sanitizePreferences(value: Partial<Preferences> | null): Preferences {
  return {
    seeds: Array.isArray(value?.seeds) ? value.seeds.filter((s) => s && validId(s.id) && typeof s.title === "string")
      .filter((s, i, all) => all.findIndex((item) => item.id === s.id) === i).slice(0, 3)
      .map((s) => ({ id: s.id, title: s.title.slice(0, 300), coverImage: typeof s.coverImage === "string" ? s.coverImage : null })) : [],
    hiddenIds: Array.isArray(value?.hiddenIds) ? [...new Set(value.hiddenIds.filter(validId))].slice(-5000) : [],
    diversity: typeof value?.diversity === "number" && Number.isFinite(value.diversity) ? Math.max(0, Math.min(1, value.diversity)) : 0.3,
    excludedGenres: Array.isArray(value?.excludedGenres) ? [...new Set(value.excludedGenres.filter((g) => typeof g === "string"))].slice(0, 30) : [],
  };
}

export function getDiscoverySnapshot(): Snapshot {
  if (typeof window === "undefined") return EMPTY;
  const scope = getListStorageScope();
  const key = `${scope}.discovery.v1`;
  let raw: string | null = null;
  try { raw = localStorage.getItem(key); } catch { /* Session-only when storage is unavailable. */ }
  if (cache?.key === key && cache.raw === raw) return cache.value;
  let parsed = null;
  try { parsed = raw ? JSON.parse(raw) : null; } catch { /* Recover invalid preferences. */ }
  const value = { scope, ...sanitizePreferences(parsed) };
  cache = { key, raw, value };
  return value;
}

export function updateDiscoveryPreferences(patch: Partial<Preferences>): void {
  const current = getDiscoverySnapshot();
  const value = { scope: current.scope, ...sanitizePreferences({ ...current, ...patch }) };
  const key = `${current.scope}.discovery.v1`;
  // `updatedAt` versions the document for cloud sync; `syncedAt` survives edits.
  const { syncedAt } = parseStamps(readKey(key));
  let raw = cache?.raw ?? null;
  try {
    const saved = JSON.stringify({ ...value, updatedAt: new Date().toISOString(), syncedAt });
    localStorage.setItem(key, saved);
    raw = saved;
  } catch { /* Keep this session usable. */ }
  cache = { key, raw, value };
  window.dispatchEvent(new Event(EVENT));
}

// ---- Cloud sync access (src/lib/sync/preferences.ts) ----

/** A stored document plus its sync stamps. `updatedAt` is null for data saved before sync existed. */
export interface PreferencesRecord { prefs: Preferences; updatedAt: string | null; syncedAt: string | null }

export const DISCOVERY_EVENT = EVENT;
const discoveryKey = (userId: string | null) => `${listStorageKey(userId)}.discovery.v1`;
const stamp = (value: unknown): string | null =>
  typeof value === "string" && Number.isFinite(Date.parse(value)) ? value : null;

function readKey(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}
function parseStamps(raw: string | null): { updatedAt: string | null; syncedAt: string | null } {
  try {
    const parsed = raw ? JSON.parse(raw) : null;
    return { updatedAt: stamp(parsed?.updatedAt), syncedAt: stamp(parsed?.syncedAt) };
  } catch { return { updatedAt: null, syncedAt: null }; }
}

export function readPreferencesRecord(userId: string | null): PreferencesRecord | null {
  const raw = readKey(discoveryKey(userId));
  if (raw === null) return null;
  let parsed = null;
  try { parsed = JSON.parse(raw); } catch { /* Recover invalid preferences. */ }
  return { prefs: sanitizePreferences(parsed), ...parseStamps(raw) };
}

/** Writes one account's document and notifies views. Throws if storage is unavailable. */
export function writePreferencesRecord(userId: string | null, record: PreferencesRecord): void {
  localStorage.setItem(discoveryKey(userId), JSON.stringify({ ...sanitizePreferences(record.prefs),
    updatedAt: record.updatedAt, syncedAt: record.syncedAt }));
  window.dispatchEvent(new Event(EVENT));
}

export function removePreferencesRecord(userId: string | null): void {
  try { localStorage.removeItem(discoveryKey(userId)); } catch { /* best effort */ }
}

function subscribe(cb: () => void): () => void {
  const unsubscribe = subscribeList(cb);
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb);
  return () => { unsubscribe(); window.removeEventListener(EVENT, cb); window.removeEventListener("storage", cb); };
}

export function useDiscoveryPreferences(): Snapshot {
  return useSyncExternalStore(subscribe, getDiscoverySnapshot, () => EMPTY);
}
