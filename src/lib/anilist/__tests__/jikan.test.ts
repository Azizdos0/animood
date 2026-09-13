import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { jikanRequest, JikanError } from "@/lib/anilist/jikan";

function mockFetchOnce(status: number, body: unknown, headers: Record<string, string> = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (k: string) => headers[k.toLowerCase()] ?? null },
    json: async () => body,
  } as unknown as Response;
}

describe("jikanRequest", () => {
  beforeEach(() => { vi.restoreAllMocks(); });
  afterEach(() => { vi.restoreAllMocks(); });

  it("returns the parsed body on a 200 response", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      mockFetchOnce(200, { data: { mal_id: 1 } })
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await jikanRequest<{ data: { mal_id: number } }>("/anime/1");
    expect(result).toEqual({ data: { mal_id: 1 } });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.jikan.moe/v4/anime/1");
    expect(init.headers.Accept).toBe("application/json");
  });

  it("retries on 429 (honoring Retry-After) then succeeds", async () => {
    vi.useFakeTimers();
    try {
      const fetchMock = vi.fn()
        .mockResolvedValueOnce(mockFetchOnce(429, {}, { "retry-after": "0" }))
        .mockResolvedValueOnce(mockFetchOnce(200, { data: { mal_id: 2 } }));
      vi.stubGlobal("fetch", fetchMock);

      const promise = jikanRequest<{ data: { mal_id: number } }>("/anime/2", { maxRetries: 2 });
      const assertion = expect(promise).resolves.toEqual({ data: { mal_id: 2 } });
      await vi.runAllTimersAsync();
      await assertion;
      expect(fetchMock).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("throws JikanError with the status once 5xx retries are exhausted", async () => {
    vi.useFakeTimers();
    try {
      const fetchMock = vi.fn().mockResolvedValue(mockFetchOnce(503, {}));
      vi.stubGlobal("fetch", fetchMock);

      const promise = jikanRequest("/anime/3", { maxRetries: 1 });
      const assertion = expect(promise).rejects.toMatchObject({ status: 503 });
      await vi.runAllTimersAsync();
      await assertion;

      const caught = await promise.catch((err) => err);
      expect(caught).toBeInstanceOf(JikanError);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("throttle prevents two concurrent jikanRequest calls from starting simultaneously", async () => {
    vi.useFakeTimers();
    try {
      const starts: number[] = [];
      const fetchMock = vi.fn(async () => {
        starts.push(Date.now());
        return mockFetchOnce(200, { data: {} });
      });
      vi.stubGlobal("fetch", fetchMock);

      const p1 = jikanRequest("/anime/10");
      const p2 = jikanRequest("/anime/11");
      await vi.runAllTimersAsync();
      await Promise.all([p1, p2]);

      expect(starts).toHaveLength(2);
      expect(starts[1] - starts[0]).toBeGreaterThanOrEqual(350);
    } finally {
      vi.useRealTimers();
    }
  });
});
