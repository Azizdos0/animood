// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { gzipSync } from "node:zlib";
import { POST } from "@/app/api/import/mal/route";
import * as media from "@/lib/anilist/media";

const ANIME_XML = `<?xml version="1.0" encoding="UTF-8" ?>
<myanimelist>
  <myinfo><user_export_type>1</user_export_type></myinfo>
  <anime>
    <series_animedb_id>21</series_animedb_id>
    <my_watched_episodes>1050</my_watched_episodes>
    <my_score>9</my_score>
    <my_status>Watching</my_status>
  </anime>
  <anime>
    <series_animedb_id>999999</series_animedb_id>
    <my_watched_episodes>1</my_watched_episodes>
    <my_score>0</my_score>
    <my_status>Completed</my_status>
  </anime>
</myanimelist>`;

function postWith(file: File): Request {
  const form = new FormData();
  form.append("files", file);
  return new Request("http://x/api/import/mal", { method: "POST", body: form });
}

describe("/api/import/mal", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("400s when no files are provided", async () => {
    const res = await POST(new Request("http://x/api/import/mal", { method: "POST", body: new FormData() }));
    expect(res.status).toBe(400);
  });

  it("parses a plain XML export, matches by MAL id, reports unmatched", async () => {
    vi.spyOn(media, "getMediaByMalIds").mockResolvedValue([
      { id: 21, idMal: 21, title: "One Piece", coverImage: "op.jpg", format: "TV" },
    ]);
    const file = new File([ANIME_XML], "animelist.xml", { type: "text/xml" });
    const res = await POST(postWith(file));
    const body = await res.json();
    expect(body.total).toBe(2);
    expect(body.unmatched).toBe(1);
    expect(body.matched).toHaveLength(1);
    expect(body.matched[0]).toMatchObject({ mediaId: 21, status: "watching", score: 9, progress: 1050 });
  });

  it("transparently gunzips a .gz export", async () => {
    vi.spyOn(media, "getMediaByMalIds").mockResolvedValue([
      { id: 21, idMal: 21, title: "One Piece", coverImage: null, format: "TV" },
    ]);
    const gz = gzipSync(Buffer.from(ANIME_XML, "utf-8"));
    const file = new File([gz], "animelist.xml.gz", { type: "application/gzip" });
    const res = await POST(postWith(file));
    const body = await res.json();
    expect(body.matched).toHaveLength(1);
  });

  it("422s on a non-MAL file", async () => {
    const file = new File(["<html>nope</html>"], "x.xml", { type: "text/xml" });
    const res = await POST(postWith(file));
    expect(res.status).toBe(422);
  });
});
