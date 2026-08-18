import Link from "next/link";

export function Navbar() {
  return (
    <header className="sticky top-0 z-10 border-b border-black/10 bg-background/80 backdrop-blur dark:border-white/10">
      <nav className="mx-auto flex max-w-6xl items-center gap-6 px-4 py-3">
        <Link href="/" className="text-lg font-bold tracking-tight">
          Animood
        </Link>
        <div className="ml-auto flex items-center gap-4 text-sm font-medium">
          <Link href="/search" className="hover:text-indigo-500">Search</Link>
          <Link href="/my-list" className="hover:text-indigo-500">My List</Link>
        </div>
      </nav>
    </header>
  );
}
