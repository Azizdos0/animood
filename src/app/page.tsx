import Link from "next/link";
import { getTrending } from "@/lib/anilist/media";
import { MediaRow, toCardData } from "@/components/MediaRow";

function Hero() {
  return (
    <section className="relative overflow-hidden rounded-3xl border border-border bg-surface/60 px-6 py-12 sm:px-10 sm:py-16">
      <div className="absolute -right-16 -top-16 h-64 w-64 rounded-full bg-primary/20 blur-3xl" />
      <div className="absolute -bottom-20 -left-10 h-64 w-64 rounded-full bg-accent/20 blur-3xl" />
      <div className="relative max-w-2xl">
        <span className="inline-flex items-center rounded-full border border-border bg-background/50 px-3 py-1 text-xs font-medium text-muted-foreground">
          Track. Discover. Obsess.
        </span>
        <h1 className="mt-4 font-display text-4xl font-extrabold leading-[1.05] tracking-tight sm:text-6xl">
          Your anime &amp; manga,{" "}
          <span className="bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
            beautifully tracked
          </span>
          .
        </h1>
        <p className="mt-4 max-w-xl text-base text-muted-foreground sm:text-lg">
          Browse thousands of titles, build your list, and get recommendations
          that actually understand your taste.
        </p>
        <div className="mt-7 flex flex-wrap gap-3">
          <Link
            href="/search"
            className="rounded-xl bg-gradient-to-r from-primary-strong to-accent px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-primary/25 transition-transform hover:scale-[1.03]"
          >
            Explore titles
          </Link>
          <Link
            href="/my-list"
            className="rounded-xl border border-border-strong bg-surface px-5 py-3 text-sm font-semibold text-foreground transition-colors hover:bg-surface-hover"
          >
            My list
          </Link>
        </div>
      </div>
    </section>
  );
}

export default async function HomePage() {
  let content;
  try {
    const [anime, manga] = await Promise.all([
      getTrending("ANIME", 12),
      getTrending("MANGA", 12),
    ]);
    content = (
      <>
        <MediaRow title="Trending Anime" items={anime.map(toCardData)} />
        <MediaRow title="Trending Manga" items={manga.map(toCardData)} />
      </>
    );
  } catch {
    content = (
      <p className="rounded-2xl border border-dashed border-border py-12 text-center text-sm text-muted-foreground">
        Couldn&apos;t load trending titles right now. Please try again later.
      </p>
    );
  }

  return (
    <div className="space-y-12">
      <Hero />
      {content}
    </div>
  );
}
