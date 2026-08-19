import Link from "next/link";
import { MyListView } from "@/components/MyListView";
import { PageHead } from "@/components/editorial";
import { UploadIcon } from "@/components/icons";

export default function MyListPage() {
  return (
    <div className="mx-auto max-w-[1560px] space-y-8 px-6 py-12 sm:px-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <PageHead kicker="MY LIST · STORED IN THIS BROWSER" accent="violet">
          My list
        </PageHead>
        <Link
          href="/import"
          className="inline-flex items-center gap-2 rounded-full border border-border-strong bg-surface px-5 py-2.5 text-sm font-bold transition-colors hover:border-foreground"
        >
          <UploadIcon size={16} /> Import from MyAnimeList
        </Link>
      </div>
      <MyListView />
    </div>
  );
}
