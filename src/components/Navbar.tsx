import Link from "next/link";

export function Navbar() {
  return (
    <header className="sticky top-0 z-20 border-b border-border bg-background/70 backdrop-blur-xl">
      <nav className="mx-auto flex max-w-6xl items-center gap-6 px-4 py-3.5 sm:px-6">
        <Link
          href="/"
          className="font-display text-xl font-extrabold tracking-tight"
        >
          <span className="bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
            Animood
          </span>
        </Link>
        <div className="ml-auto flex items-center gap-1 text-sm font-medium">
          <Link
            href="/search"
            className="rounded-full px-3 py-1.5 text-muted-foreground transition-colors hover:bg-surface-hover hover:text-foreground"
          >
            Search
          </Link>
          <Link
            href="/recommendations"
            className="rounded-full px-3 py-1.5 text-muted-foreground transition-colors hover:bg-surface-hover hover:text-foreground"
          >
            For You
          </Link>
          <Link
            href="/my-list"
            className="rounded-full px-3 py-1.5 text-muted-foreground transition-colors hover:bg-surface-hover hover:text-foreground"
          >
            My List
          </Link>
          <Link
            href="/stats"
            className="rounded-full px-3 py-1.5 text-muted-foreground transition-colors hover:bg-surface-hover hover:text-foreground"
          >
            Stats
          </Link>
        </div>
      </nav>
    </header>
  );
}
