import Link from "next/link";
import { MyListView } from "@/components/MyListView";

export default function MyListPage() {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <span className="h-6 w-1.5 rounded-full bg-gradient-to-b from-primary to-accent" />
        <h1 className="font-display text-2xl font-bold tracking-tight">My List</h1>
        <Link
          href="/import"
          className="ml-auto rounded-xl border border-border-strong bg-surface px-4 py-2 text-sm font-semibold transition-colors hover:bg-surface-hover"
        >
          Import from MyAnimeList
        </Link>
      </div>
      <MyListView />
    </div>
  );
}
