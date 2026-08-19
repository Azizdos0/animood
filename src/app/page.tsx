import Link from "next/link";
import { getTrending } from "@/lib/anilist/media";
import { MediaRow, toCardData } from "@/components/MediaRow";
import { CompassIcon, BookmarkIcon } from "@/components/icons";
import { LogoMark } from "@/components/Logo";

function Hero() {
  return (
    <section className="relative overflow-hidden rounded-3xl border border-border bg-surface/60 px-6 py-12 sm:px-10 sm:py-16">
      {/* Animated aurora */}
      <div className="drift-slow absolute -right-16 -top-16 h-72 w-72 rounded-full bg-primary/25 blur-[90px]" />
      <div className="drift-slower absolute -bottom-24 left-1/3 h-72 w-72 rounded-full bg-accent/25 blur-[90px]" />
      <div className="drift-slow absolute -left-16 top-1/3 h-56 w-56 rounded-full bg-fuchsia-500/15 blur-[80px]" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(60rem_30rem_at_80%_-20%,rgba(168,85,247,0.12),transparent)]" />
      <div className="relative max-w-2xl">
        <span className="inline-flex items-center gap-2 rounded-full border border-border bg-background/50 px-3 py-1 text-xs font-medium text-muted-foreground">
          <LogoMark size={16} id="am-hero" /> Track. Discover. Obsess.
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
            className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-primary-strong to-accent px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-primary/25 transition-transform hover:scale-[1.03]"
          >
            <CompassIcon size={17} /> Explore titles
          </Link>
          <Link
            href="/my-list"
            className="inline-flex items-center gap-2 rounded-xl border border-border-strong bg-surface px-5 py-3 text-sm font-semibold text-foreground transition-colors hover:bg-surface-hover"
          >
            <BookmarkIcon size={17} /> My list
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
