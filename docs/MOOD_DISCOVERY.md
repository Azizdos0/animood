# Mood discovery

The home mood cards link to `/recommendations?mood=calm&type=ANIME`.
Mood and catalog type live in the URL, so links, reloads, and browser history retain them.

## Selection and ranking

- `src/lib/recommend/moods.ts` defines six moods and their genre/tag signals. Calm and comfort exclude strong horror, thriller, tragedy, and gore signals.
- The recommendations API fetches genre-specific candidate pools even for an empty list. It combines these with community recommendations derived from ratings and up to three starter favorites.
- Starter favorites supply a positive taste signal without creating list entries or inventing numeric ratings. Explicit ratings take precedence if a starter also has a rating.
- Presentation filters hidden titles and excluded genres before selecting up to 24 results. Mood affinity and bounded personal scores feed the existing diversity reranker.
- Explanations cite actual catalog genres and contributing taste tags. Labels are descriptive, not percentage predictions. Mood fit is a metadata heuristic, not a guarantee about every scene.

## Storage and failures

Starter favorites, hidden titles, variety, and genre exclusions are stored under the active list account's browser namespace. They are isolated from other accounts and the guest session. These discovery preferences do **not** currently sync through Supabase; tracked list additions use the existing list sync path.

Requests are canceled on mood, type, taste, or account changes. Late responses cannot replace the current account's recommendations. Individual catalog failures allow partial results; total failures offer retry. The homepage keeps mood entry points and list progress available when trending fails.

## Verification

`npm test` covers mood selection, taste signals, seed search and selection, hidden-pick replacement and persistence, account isolation, late responses, and catalog failure handling. `npm run build` checks the production build and TypeScript.

During implementation, AniList returned HTTP 403 with a notice that its API was temporarily disabled for stability issues. The live failure state was checked; desktop and mobile success flows were checked using browser-only catalog fixtures. Assess recommendation quality against live catalog data once the upstream service is available.
