export const ANILIST_ENDPOINT = "https://graphql.anilist.co";

export class AniListError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "AniListError";
    this.status = status;
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface RequestOpts {
  revalidateSeconds?: number;
  maxRetries?: number;
}

export async function anilistRequest<T>(
  query: string,
  variables: Record<string, unknown> = {},
  opts: RequestOpts = {}
): Promise<T> {
  const { revalidateSeconds = 3600, maxRetries = 2 } = opts;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    let res: Response;
    let json: { data?: T; errors?: { message: string }[] };
    try {
      res = await fetch(ANILIST_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ query, variables }),
        // Next.js server-side cache; ignored in test/jsdom.
        next: { revalidate: revalidateSeconds },
      } as RequestInit);

      if (res.status === 429 || res.status >= 500) {
        if (attempt === maxRetries) {
          throw new AniListError(`AniList request failed (${res.status})`, res.status);
        }
        const retryAfter = Number(res.headers.get("retry-after"));
        const backoff = Number.isFinite(retryAfter) && retryAfter > 0
          ? retryAfter * 1000
          : 2 ** attempt * 500;
        await sleep(backoff);
        continue;
      }

      json = (await res.json()) as { data?: T; errors?: { message: string }[] };
    } catch (err) {
      // A thrown AniListError above (retries exhausted on 429/5xx) should
      // propagate as-is, not be reinterpreted as a network failure.
      if (err instanceof AniListError) throw err;
      // fetch()/res.json() itself failed (DNS/offline/connection reset,
      // or a malformed 200 body) — treat like a 5xx: retry with backoff,
      // then surface as AniListError once retries are exhausted.
      if (attempt === maxRetries) {
        throw new AniListError("AniList request failed (network error)", 0);
      }
      await sleep(2 ** attempt * 500);
      continue;
    }

    if (json.errors && json.errors.length > 0) {
      throw new AniListError(json.errors.map((e) => e.message).join("; "), res.status);
    }
    if (!res.ok || !json.data) {
      throw new AniListError(`AniList request failed (${res.status})`, res.status);
    }
    return json.data;
  }

  // Unreachable: every loop iteration either returns, retries via `continue`,
  // or throws on the final attempt. Kept as a safety net for exhaustiveness.
  throw new AniListError("AniList request failed (retries exhausted)", 0);
}
