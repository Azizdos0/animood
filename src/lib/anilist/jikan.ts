export const JIKAN_ENDPOINT = "https://api.jikan.moe/v4";

export class JikanError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "JikanError";
    this.status = status;
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// --- Shared throttle -------------------------------------------------------
// Jikan v4 allows ~3 req/s and ~60 req/min. We cap concurrency and enforce a
// minimum spacing between request *starts* so every caller of jikanRequest
// (across the whole process) shares one budget.
const MAX_CONCURRENT = 2;
const MIN_SPACING_MS = 350;

let active = 0;
let lastStart = 0;
const waiting: Array<() => void> = [];
let scheduledTimer: ReturnType<typeof setTimeout> | null = null;

function pump(): void {
  if (scheduledTimer !== null) return;
  if (active >= MAX_CONCURRENT || waiting.length === 0) return;

  const wait = Math.max(0, lastStart + MIN_SPACING_MS - Date.now());
  scheduledTimer = setTimeout(() => {
    scheduledTimer = null;
    if (active >= MAX_CONCURRENT || waiting.length === 0) return;
    active++;
    lastStart = Date.now();
    const resolve = waiting.shift();
    resolve?.();
    // Try to fill the next slot too, still respecting spacing.
    pump();
  }, wait);
}

/**
 * Runs `fn` through a shared queue that allows at most MAX_CONCURRENT
 * in-flight calls, with at least MIN_SPACING_MS between call *starts*.
 * Hand-rolled (no deps) — a promise-chain queue + timestamp gate.
 */
export function throttle<T>(fn: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolveOuter, rejectOuter) => {
    waiting.push(() => {
      fn().then(resolveOuter, rejectOuter).finally(() => {
        active--;
        pump();
      });
    });
    pump();
  });
}

interface JikanRequestOpts {
  revalidateSeconds?: number;
  maxRetries?: number;
  signal?: AbortSignal;
}

export async function jikanRequest<T>(path: string, opts: JikanRequestOpts = {}): Promise<T> {
  const { revalidateSeconds = 86400, maxRetries = 2, signal } = opts;

  return throttle(async () => {
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      let res: Response;
      try {
        res = await fetch(`${JIKAN_ENDPOINT}${path}`, {
          method: "GET",
          headers: { Accept: "application/json" },
          // Next.js server-side cache; ignored in test/jsdom.
          next: { revalidate: revalidateSeconds },
          signal,
        } as RequestInit);
      } catch (err) {
        // fetch() itself failed (DNS/offline/connection reset) — treat like
        // a 5xx: retry with backoff, then surface as JikanError once
        // retries are exhausted.
        if (attempt === maxRetries) {
          throw new JikanError("Jikan request failed (network error)", 0);
        }
        await sleep(2 ** attempt * 500);
        continue;
      }

      if (res.status === 429 || res.status >= 500) {
        if (attempt === maxRetries) {
          throw new JikanError(`Jikan request failed (${res.status})`, res.status);
        }
        const retryAfter = Number(res.headers.get("retry-after"));
        const backoff = Number.isFinite(retryAfter) && retryAfter > 0
          ? retryAfter * 1000
          : 2 ** attempt * 500;
        await sleep(backoff);
        continue;
      }

      if (!res.ok) {
        throw new JikanError(`Jikan request failed (${res.status})`, res.status);
      }

      return (await res.json()) as T;
    }

    // Unreachable: every loop iteration either returns, retries via
    // `continue`, or throws on the final attempt. Kept as a safety net.
    throw new JikanError("Jikan request failed (retries exhausted)", 0);
  });
}
