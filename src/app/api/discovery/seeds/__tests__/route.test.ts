import { beforeEach, describe, expect, it, vi } from "vitest";
import * as media from "@/lib/anilist/media";
import type { Media } from "@/lib/anilist/types";
import { GET } from "../route";

describe("favorite search", () => {
  beforeEach(() => vi.restoreAllMocks());
  it("searches the requested catalog and returns only starter fields", async () => {
    const search = vi.spyOn(media, "searchMedia").mockResolvedValue({ items: [{ id: 1, title: "Favorite", coverImage: null, description: "unused" } as Media], hasNextPage: false });
    const res = await GET(new Request("http://localhost/api/discovery/seeds?type=MANGA&q=Favorite"));
    expect(await res.json()).toEqual({ items: [{ id: 1, title: "Favorite", coverImage: null }] });
    expect(search).toHaveBeenCalledWith(expect.objectContaining({ type: "MANGA", search: "Favorite", perPage: 12 }));
  });
  it("rejects invalid input before contacting the catalog", async () => {
    const search = vi.spyOn(media, "searchMedia");
    expect((await GET(new Request("http://localhost/api/discovery/seeds?type=INVALID"))).status).toBe(400);
    expect((await GET(new Request(`http://localhost/api/discovery/seeds?q=${"a".repeat(151)}`))).status).toBe(400);
    expect(search).not.toHaveBeenCalled();
  });
  it("returns a retryable failure if the catalog is unavailable", async () => {
    vi.spyOn(media, "searchMedia").mockRejectedValue(new Error("offline"));
    expect((await GET(new Request("http://localhost/api/discovery/seeds"))).status).toBe(502);
  });
});
