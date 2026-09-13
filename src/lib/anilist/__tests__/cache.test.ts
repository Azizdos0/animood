import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Media } from "@/lib/anilist/types";
import type { SupaLike } from "@/lib/sync/cloud";

const { isServiceConfiguredMock, supabaseServiceMock } = vi.hoisted(() => ({
  isServiceConfiguredMock: vi.fn(),
  supabaseServiceMock: vi.fn(),
}));

vi.mock("@/lib/supabase/service", () => ({
  isServiceConfigured: isServiceConfiguredMock,
  supabaseService: supabaseServiceMock,
}));

import { readCache, writeCache } from "@/lib/anilist/cache";

function media(id: number): Media {
  return {
    id,
    type: "ANIME",
    title: `T${id}`,
    coverImage: null,
    bannerImage: null,
    description: null,
    genres: [],
    tags: [],
    format: null,
    episodes: null,
    chapters: null,
    averageScore: null,
    popularity: 0,
    seasonYear: null,
    relations: [],
  } as unknown as Media;
}

describe("readCache", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("returns [] for empty malIds without querying", async () => {
    const fromMock = vi.fn();
    const supabase = { from: fromMock, rpc: vi.fn() } as unknown as SupaLike;
    expect(await readCache(supabase, [])).toEqual([]);
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("maps returned rows to Media", async () => {
    const m1 = media(21);
    const m2 = media(5114);
    const inMock = vi.fn().mockResolvedValue({ data: [{ media: m1 }, { media: m2 }], error: null });
    const eqMock = vi.fn().mockReturnValue({ in: inMock });
    const selectMock = vi.fn().mockReturnValue({ eq: eqMock });
    const fromMock = vi.fn().mockReturnValue({ select: selectMock });
    const supabase = { from: fromMock, rpc: vi.fn() } as unknown as SupaLike;

    const result = await readCache(supabase, [21, 5114]);

    expect(fromMock).toHaveBeenCalledWith("media_cache");
    expect(selectMock).toHaveBeenCalledWith("media");
    expect(eqMock).toHaveBeenCalledWith("type", "anime");
    expect(inMock).toHaveBeenCalledWith("mal_id", [21, 5114]);
    expect(result).toEqual([m1, m2]);
  });

  it("throws when the query errors", async () => {
    const inMock = vi.fn().mockResolvedValue({ data: null, error: new Error("boom") });
    const eqMock = vi.fn().mockReturnValue({ in: inMock });
    const selectMock = vi.fn().mockReturnValue({ eq: eqMock });
    const fromMock = vi.fn().mockReturnValue({ select: selectMock });
    const supabase = { from: fromMock, rpc: vi.fn() } as unknown as SupaLike;

    await expect(readCache(supabase, [21])).rejects.toThrow("boom");
  });
});

describe("writeCache", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    isServiceConfiguredMock.mockReset();
    supabaseServiceMock.mockReset();
  });

  it("no-ops when media is empty", async () => {
    isServiceConfiguredMock.mockReturnValue(true);
    await writeCache([]);
    expect(supabaseServiceMock).not.toHaveBeenCalled();
  });

  it("no-ops when service is not configured (rpc not called)", async () => {
    isServiceConfiguredMock.mockReturnValue(false);
    await writeCache([media(21)]);
    expect(supabaseServiceMock).not.toHaveBeenCalled();
  });

  it("calls rpc with the correct shape when configured", async () => {
    isServiceConfiguredMock.mockReturnValue(true);
    const rpcMock = vi.fn().mockResolvedValue({ data: null, error: null });
    supabaseServiceMock.mockReturnValue({ rpc: rpcMock });

    const m = media(21);
    await writeCache([m]);

    expect(rpcMock).toHaveBeenCalledWith("upsert_media_cache", {
      p_rows: [{ mal_id: 21, type: "anime", media: m }],
    });
  });

  it("swallows an rpc error (resolves, does not reject)", async () => {
    isServiceConfiguredMock.mockReturnValue(true);
    const rpcMock = vi.fn().mockRejectedValue(new Error("boom"));
    supabaseServiceMock.mockReturnValue({ rpc: rpcMock });
    vi.spyOn(console, "warn").mockImplementation(() => {});

    await expect(writeCache([media(21)])).resolves.toBeUndefined();
  });
});
