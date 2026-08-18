import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET } from "@/app/api/media/route";
import * as media from "@/lib/anilist/media";

describe("/api/media route", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("returns empty items for missing ids", async () => {
    const res = await GET(new Request("http://x/api/media"));
    expect(await res.json()).toEqual({ items: [] });
  });

  it("parses ids and returns fetched items", async () => {
    vi.spyOn(media, "getMediaByIds").mockResolvedValue([
      { id: 3 } as never,
    ]);
    const res = await GET(new Request("http://x/api/media?ids=3,foo,5"));
    const body = await res.json();
    expect(media.getMediaByIds).toHaveBeenCalledWith([3, 5]);
    expect(body.items).toHaveLength(1);
  });
});
