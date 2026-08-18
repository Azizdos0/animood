import { describe, it, expect } from "vitest";
import {
  parseMalExport,
  mapMalStatus,
  mapMalScore,
  toImportEntries,
  type MalEntry,
} from "@/lib/import/mal";
import type { MalMediaStub } from "@/lib/anilist/media";

const ANIME_XML = `<?xml version="1.0" encoding="UTF-8" ?>
<myanimelist>
  <myinfo>
    <user_id>1</user_id>
    <user_name>tester</user_name>
    <user_export_type>1</user_export_type>
    <user_total_anime>2</user_total_anime>
  </myinfo>
  <anime>
    <series_animedb_id>21</series_animedb_id>
    <series_title><![CDATA[One Piece]]></series_title>
    <series_type>TV</series_type>
    <my_watched_episodes>1050</my_watched_episodes>
    <my_score>9</my_score>
    <my_status>Watching</my_status>
    <update_on_import>1</update_on_import>
  </anime>
  <anime>
    <series_animedb_id>5114</series_animedb_id>
    <series_title><![CDATA[Fullmetal Alchemist: Brotherhood]]></series_title>
    <series_type>TV</series_type>
    <my_watched_episodes>64</my_watched_episodes>
    <my_score>0</my_score>
    <my_status>Completed</my_status>
    <update_on_import>1</update_on_import>
  </anime>
</myanimelist>`;

const MANGA_XML = `<?xml version="1.0" encoding="UTF-8" ?>
<myanimelist>
  <myinfo>
    <user_export_type>2</user_export_type>
    <user_total_manga>1</user_total_manga>
  </myinfo>
  <manga>
    <manga_mangadb_id>13</manga_mangadb_id>
    <manga_title><![CDATA[One Piece]]></manga_title>
    <my_read_chapters>1090</my_read_chapters>
    <my_score>10</my_score>
    <my_status>Plan to Read</my_status>
  </manga>
</myanimelist>`;

describe("parseMalExport", () => {
  it("parses an anime export into entries with the ANIME type", () => {
    const { type, entries } = parseMalExport(ANIME_XML);
    expect(type).toBe("ANIME");
    expect(entries).toHaveLength(2);
    expect(entries[0]).toEqual({ malId: 21, status: "Watching", score: 9, progress: 1050 });
    expect(entries[1]).toEqual({ malId: 5114, status: "Completed", score: 0, progress: 64 });
  });

  it("parses a manga export into entries with the MANGA type", () => {
    const { type, entries } = parseMalExport(MANGA_XML);
    expect(type).toBe("MANGA");
    expect(entries).toHaveLength(1);
    expect(entries[0]).toEqual({ malId: 13, status: "Plan to Read", score: 10, progress: 1090 });
  });

  it("throws on non-MAL XML", () => {
    expect(() => parseMalExport("<html><body>nope</body></html>")).toThrow();
  });
});

describe("mapMalStatus", () => {
  it("maps every MAL status to a list status", () => {
    expect(mapMalStatus("Watching")).toBe("watching");
    expect(mapMalStatus("Reading")).toBe("watching");
    expect(mapMalStatus("Completed")).toBe("completed");
    expect(mapMalStatus("On-Hold")).toBe("onhold");
    expect(mapMalStatus("Dropped")).toBe("dropped");
    expect(mapMalStatus("Plan to Watch")).toBe("planning");
    expect(mapMalStatus("Plan to Read")).toBe("planning");
  });

  it("falls back to planning for unknown status", () => {
    expect(mapMalStatus("Whatever")).toBe("planning");
  });
});

describe("mapMalScore", () => {
  it("maps 0 to null and clamps 1-10", () => {
    expect(mapMalScore(0)).toBeNull();
    expect(mapMalScore(9)).toBe(9);
    expect(mapMalScore(11)).toBe(10);
    expect(mapMalScore(-3)).toBeNull();
  });
});

describe("toImportEntries", () => {
  const entries: MalEntry[] = [
    { malId: 21, status: "Watching", score: 9, progress: 1050 },
    { malId: 999999, status: "Completed", score: 8, progress: 12 },
  ];
  const stubs: MalMediaStub[] = [
    { id: 21, idMal: 21, title: "One Piece", coverImage: "op.jpg", format: "TV" },
  ];

  it("matches by MAL id and reports unmatched", () => {
    const { matched, unmatched } = toImportEntries(entries, stubs);
    expect(matched).toHaveLength(1);
    expect(matched[0]).toEqual({
      mediaId: 21, malId: 21, title: "One Piece", coverImage: "op.jpg",
      status: "watching", score: 9, progress: 1050,
    });
    expect(unmatched).toEqual([999999]);
  });
});
