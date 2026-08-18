import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { anilistRequest, AniListError } from "@/lib/anilist/client";

function mockFetchOnce(status: number, body: unknown, headers: Record<string, string> = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (k: string) => headers[k.toLowerCase()] ?? null },
    json: async () => body,
  } as unknown as Response;
}

describe("anilistRequest", () => {
  beforeEach(() => { vi.restoreAllMocks(); });
  afterEach(() => { vi.restoreAllMocks(); });

  it("returns the data payload on success", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      mockFetchOnce(200, { data: { Media: { id: 5 } } })
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await anilistRequest<{ Media: { id: number } }>("query {}", {});
    expect(result.Media.id).toBe(5);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retries on 429 then succeeds", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(mockFetchOnce(429, {}, { "retry-after": "0" }))
      .mockResolvedValueOnce(mockFetchOnce(200, { data: { ok: true } }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await anilistRequest<{ ok: boolean }>("q", {}, { maxRetries: 2 });
    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("throws AniListError after exhausting retries", async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockFetchOnce(500, {}));
    vi.stubGlobal("fetch", fetchMock);

    await expect(anilistRequest("q", {}, { maxRetries: 1 })).rejects.toBeInstanceOf(AniListError);
  });

  it("throws AniListError when the GraphQL response contains errors", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      mockFetchOnce(200, { errors: [{ message: "bad query" }] })
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(anilistRequest("q", {})).rejects.toThrow("bad query");
  });
});
