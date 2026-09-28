# Animood

Anime & manga tracker with mood-based recommendations and a social layer.

- **Lists** — track anime/manga and import from MyAnimeList. Lists are stored in
  the browser; signing in syncs them to the cloud.
- **Recommendations** — pick a mood (`/recommendations?mood=calm`) and get picks
  ranked from your ratings, community recommendations and starter favorites,
  with a reason for each. See [docs/MOOD_DISCOVERY.md](docs/MOOD_DISCOVERY.md).
- **Stats** — score histogram, genre/tag breakdowns and a shareable stats card.
- **Airing schedule** — `/schedule` lists next episodes for the coming week in your
  local time (your shows first, or everything popular that's airing), and the home
  page shows countdowns and new-episode counts for shows you're watching.
- **Social** — public profiles (`/u/<username>`), follows and a feed, comments,
  per-title discussion threads, and user-created communities with moderation.

Catalog data comes from the [AniList](https://anilist.co) GraphQL API.

## Stack

Next.js 16 (App Router) · React 19 · Tailwind CSS v4 · Supabase (auth, Postgres,
row-level security) · Vitest + Testing Library.

> Next.js 16 has breaking changes from earlier versions — see [AGENTS.md](AGENTS.md).

## Getting started

Requires Node 22.12 or newer (see `.nvmrc`).

```bash
npm install
npm run dev        # http://localhost:3000
```

Without Supabase configured the app runs in **local-only mode**: browsing,
recommendations, lists and stats work, with the list stored in the browser.
Sign-in, sync and all social features need Supabase.

### Supabase (optional)

1. Create a Supabase project and apply every migration in
   `supabase/migrations/` in filename order.
2. Copy `.env.local.example` to `.env.local` and fill in:
   ```
   NEXT_PUBLIC_SUPABASE_URL=
   NEXT_PUBLIC_SUPABASE_ANON_KEY=
   ```
3. Set up Google sign-in and redirect URLs — see
   [docs/SUPABASE_SETUP.md](docs/SUPABASE_SETUP.md).

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server |
| `npm run build` | Production build |
| `npm run lint` | ESLint |
| `npm test` | Vitest, single run (`npm run test:watch` to watch) |
| `npx next typegen && npx tsc --noEmit` | Typecheck (typegen creates Next's route types) |

CI (`.github/workflows/ci.yml`) runs lint, typecheck, tests and build on every
pull request.

## Project layout

```
src/app/           routes (pages + API route handlers)
src/components/    UI components, tests in __tests__/
src/lib/           domain logic: anilist, recommend, stats, sync, communities, …
supabase/          SQL migrations
docs/              setup + feature docs; design specs/plans in docs/superpowers/
design-system/     visual design rules
```

## Deployment

Deployable to Vercel (`vercel.json` schedules a daily `/api/keepalive` cron that
stops a free-tier Supabase project from pausing) or Netlify (`netlify.toml`).
Set the two Supabase env vars in the host's settings.
