"use client";

import { useSyncExternalStore } from "react";
import { subscribe as subscribeList } from "@/lib/list/reactive";
import { getListStorageScope } from "@/lib/list/storage";

export interface FavoriteSeed { id: number; title: string; coverImage: string | null }
interface Preferences {
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

function sanitize(value: Partial<Preferences> | null): Preferences {
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
  const value = { scope, ...sanitize(parsed) };
  cache = { key, raw, value };
  return value;
}

export function updateDiscoveryPreferences(patch: Partial<Preferences>): void {
  const current = getDiscoverySnapshot();
  const value = { scope: current.scope, ...sanitize({ ...current, ...patch }) };
  const key = `${current.scope}.discovery.v1`;
  let raw = cache?.raw ?? null;
  try { const saved = JSON.stringify(value); localStorage.setItem(key, saved); raw = saved; } catch { /* Keep this session usable. */ }
  cache = { key, raw, value };
  window.dispatchEvent(new Event(EVENT));
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
