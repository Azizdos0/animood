import { describe, it, expect, vi, beforeEach } from "vitest";
import { getMediaByMalIds } from "@/lib/anilist/media";

function malRaw(id: number, idMal: number) {
  return {
    id, idMal,
    title: { romaji: `T${id}`, english: null, native: null },
    coverImage: { large: `c${id}.jpg` },
    format: "TV",
  };
}

describe("getMediaByMalIds", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("returns empty for empty input without calling fetch", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect(await getMediaByMalIds([], "ANIME")).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("maps returned media, preserving idMal", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true, status: 200, headers: { get: () => null },
      json: async () => ({ data: { Page: { media: [malRaw(21, 21), malRaw(9, 5114)] } } }),
    } as unknown as Response);
    vi.stubGlobal("fetch", fetchMock);

    const stubs = await getMediaByMalIds([21, 5114], "ANIME");
    expect(stubs).toHaveLength(2);
    expect(stubs[0]).toEqual({ id: 21, idMal: 21, title: "T21", coverImage: "c21.jpg", format: "TV" });
  });

  it("chunks ids into batches of 50", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true, status: 200, headers: { get: () => null },
      json: async () => ({ data: { Page: { media: [] } } }),
    } as unknown as Response);
    vi.stubGlobal("fetch", fetchMock);

    await getMediaByMalIds(Array.from({ length: 120 }, (_, i) => i + 1), "ANIME");
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
