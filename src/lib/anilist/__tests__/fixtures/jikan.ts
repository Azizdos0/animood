// fixtures/jikan.ts — trimmed from a real /anime/1/full response
export const COWBOY_BEBOP_FULL = {
  mal_id: 1,
  title: "Cowboy Bebop",
  title_english: "Cowboy Bebop",
  type: "TV",
  episodes: 26,
  score: 8.75,
  members: 2071833,
  popularity: 41,
  year: 1998,
  synopsis: "Crime is timeless...",
  images: {
    jpg: { image_url: "s.jpg", small_image_url: "sm.jpg", large_image_url: "lg.jpg" },
  },
  genres: [
    { mal_id: 1, name: "Action" },
    { mal_id: 24, name: "Sci-Fi" },
  ],
  themes: [
    { mal_id: 50, name: "Adult Cast" },
    { mal_id: 29, name: "Space" },
  ],
  demographics: [],
  aired: { prop: { from: { year: 1998 } } },
  relations: [
    { relation: "Adaptation", entry: [{ mal_id: 174, type: "manga", name: "CB manga" }] },
    { relation: "Side Story", entry: [{ mal_id: 5, type: "anime", name: "CB: Tengoku no Tobira" }] },
  ],
};

export const REC_ITEM = {
  entry: { mal_id: 5, title: "CB Movie", images: { jpg: { large_image_url: "r.jpg" } } },
  votes: 42,
};
