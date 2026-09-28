"use client";

import { useSyncExternalStore } from "react";

// A minute-resolution clock shared by every countdown. The snapshot is stable within
// a minute (as useSyncExternalStore requires) and null during SSR, so server HTML
// never bakes in the server's time or timezone.
const MINUTE = 60_000;
const currentMinute = () => Math.floor(Date.now() / MINUTE) * MINUTE;

function subscribe(onChange: () => void): () => void {
  const timer = setInterval(onChange, 15_000);
  return () => clearInterval(timer);
}

export function useNow(): number | null {
  return useSyncExternalStore(subscribe, currentMinute, () => null);
}
