export const MEDIA_FIELDS = `
  id
  type
  title { romaji english native }
  coverImage { large }
  bannerImage
  description(asHtml: false)
  genres
  tags { id name rank }
  format
  episodes
  chapters
  averageScore
  popularity
  seasonYear
  relations {
    edges {
      relationType
      node { id title { romaji english } coverImage { large } format }
    }
  }
`;

export const SEARCH_QUERY = `
  query Search($search: String, $type: MediaType, $genre: String, $format: MediaFormat,
               $seasonYear: Int, $sort: [MediaSort], $page: Int, $perPage: Int) {
    Page(page: $page, perPage: $perPage) {
      pageInfo { hasNextPage }
      media(search: $search, type: $type, genre: $genre, format: $format,
            seasonYear: $seasonYear, sort: $sort, isAdult: false) {
        ${MEDIA_FIELDS}
      }
    }
  }
`;

export const MEDIA_BY_ID_QUERY = `
  query MediaById($id: Int) {
    Media(id: $id) { ${MEDIA_FIELDS} }
  }
`;

export const TRENDING_QUERY = `
  query Trending($type: MediaType, $perPage: Int) {
    Page(page: 1, perPage: $perPage) {
      media(type: $type, sort: TRENDING_DESC, isAdult: false) {
        ${MEDIA_FIELDS}
      }
    }
  }
`;

export const RECOMMENDATIONS_QUERY = `
  query Recs($mediaId: Int, $perPage: Int) {
    Media(id: $mediaId) {
      recommendations(sort: RATING_DESC, perPage: $perPage) {
        nodes {
          rating
          mediaRecommendation {
            id title { romaji english } coverImage { large } format
          }
        }
      }
    }
  }
`;
