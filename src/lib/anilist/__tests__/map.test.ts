import { describe, it, expect } from "vitest";
import {
  mapAnime,
  mapRecommendationEntry,
  mapSearchItem,
  pickTitle,
  mapFormat,
  mapScore,
  mapTags,
  mapRelations,
  normalizeRelation,
} from "@/lib/anilist/map";
import { COWBOY_BEBOP_FULL, REC_ITEM } from "@/lib/anilist/__tests__/fixtures/jikan";

describe("mapAnime", () => {
  const media = mapAnime(COWBOY_BEBOP_FULL);

  it("prefers title_english, falling back to title, then Untitled", () => {
    expect(pickTitle({ title: "Foo", title_english: "Bar" })).toBe("Bar");
    expect(pickTitle({ title: "Foo", title_english: null })).toBe("Foo");
    expect(pickTitle({ title: null, title_english: null })).toBe("Untitled");
    expect(media.title).toBe("Cowboy Bebop");
  });

  it("rounds score * 10", () => {
    expect(mapScore(8.75)).toBe(88);
    expect(mapScore(null)).toBeNull();
    expect(media.averageScore).toBe(88);
  });

  it("uses members for popularity, not the inverted popularity rank", () => {
    expect(media.popularity).toBe(2071833);
    expect(media.popularity).not.toBe(41);
  });

  it("maps format from type", () => {
    expect(mapFormat("TV")).toBe("TV");
    expect(mapFormat("TV Special")).toBe("SPECIAL");
    expect(mapFormat("Movie")).toBe("MOVIE");
    expect(mapFormat("OVA")).toBe("OVA");
    expect(mapFormat("ONA")).toBe("ONA");
    expect(mapFormat("Special")).toBe("SPECIAL");
    expect(mapFormat("Music")).toBe("MUSIC");
    expect(mapFormat("Unknown")).toBeNull();
    expect(media.format).toBe("TV");
  });

  it("maps themes + demographics to tags with rank 100", () => {
    const tags = mapTags(
      [{ mal_id: 50, name: "Adult Cast" }, { mal_id: 29, name: "Space" }],
      []
    );
    expect(tags).toEqual([
      { id: 50, name: "Adult Cast", rank: 100 },
      { id: 29, name: "Space", rank: 100 },
    ]);
    expect(media.tags).toEqual([
      { id: 50, name: "Adult Cast", rank: 100 },
      { id: 29, name: "Space", rank: 100 },
    ]);
  });

  it("always sets bannerImage null and chapters null and type ANIME", () => {
    expect(media.bannerImage).toBeNull();
    expect(media.chapters).toBeNull();
    expect(media.type).toBe("ANIME");
  });

  it("maps coverImage from images.jpg.large_image_url", () => {
    expect(media.coverImage).toBe("lg.jpg");
  });

  it("falls back seasonYear to aired.prop.from.year when year is missing", () => {
    expect(media.seasonYear).toBe(1998);
    const withoutYear = mapAnime({ ...COWBOY_BEBOP_FULL, year: null });
    expect(withoutYear.seasonYear).toBe(1998);
    const withoutEither = mapAnime({ ...COWBOY_BEBOP_FULL, year: null, aired: null });
    expect(withoutEither.seasonYear).toBeNull();
  });

  it("keeps only anime relations, dropping manga, and normalizes the relation type", () => {
    expect(media.relations).toHaveLength(1);
    expect(media.relations).toEqual([
      {
        relationType: "SIDE_STORY",
        node: { id: 5, title: "CB: Tengoku no Tobira", coverImage: null, format: null },
      },
    ]);
    // The manga "Adaptation" relation must not leak through.
    expect(media.relations.some((r) => r.node.id === 174)).toBe(false);
  });

  it("normalizeRelation covers known and fallback cases", () => {
    expect(normalizeRelation("Sequel")).toBe("SEQUEL");
    expect(normalizeRelation("Prequel")).toBe("PREQUEL");
    expect(normalizeRelation("Side Story")).toBe("SIDE_STORY");
    expect(normalizeRelation("Side story")).toBe("SIDE_STORY");
    expect(normalizeRelation("Parent story")).toBe("PARENT");
    expect(normalizeRelation("Alternative version")).toBe("ALTERNATIVE");
    expect(normalizeRelation("Character")).toBe("CHARACTER");
    expect(normalizeRelation("Full Story")).toBe("FULL_STORY");
  });

  it("mapRelations filters out non-anime entries directly", () => {
    const relations = mapRelations([
      { relation: "Adaptation", entry: [{ mal_id: 1, type: "manga", name: "M" }] },
      { relation: "Sequel", entry: [{ mal_id: 2, type: "anime", name: "S" }] },
    ]);
    expect(relations).toEqual([
      { relationType: "SEQUEL", node: { id: 2, title: "S", coverImage: null, format: null } },
    ]);
  });

  it("maps genres to a plain string array", () => {
    expect(media.genres).toEqual(["Action", "Sci-Fi"]);
  });

  it("mapSearchItem is the same function as mapAnime", () => {
    expect(mapSearchItem).toBe(mapAnime);
  });
});

describe("mapRecommendationEntry", () => {
  it("maps a Jikan /recommendations item to a MediaRecommendation", () => {
    expect(mapRecommendationEntry(REC_ITEM)).toEqual({
      mediaId: 5,
      rating: 42,
      media: {
        id: 5,
        title: "CB Movie",
        coverImage: "r.jpg",
        format: null,
      },
    });
  });

  it("falls back coverImage to null when images are missing", () => {
    const result = mapRecommendationEntry({ entry: { mal_id: 9, title: "No Image" }, votes: 0 });
    expect(result.media.coverImage).toBeNull();
  });
});
