import { searchMedia } from "@/lib/anilist/media";
import type { MediaFormat, MediaType } from "@/lib/anilist/types";
import { MediaGrid } from "@/components/MediaGrid";
import { toCardData } from "@/components/MediaRow";
import { SearchControls } from "@/components/SearchControls";

export const dynamic = "force-dynamic";

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; type?: string; format?: string }>;
}) {
  const sp = await searchParams;
  const type: MediaType = sp.type === "MANGA" ? "MANGA" : "ANIME";
  const q = sp.q ?? "";
  const format = sp.format ?? "";

  let items: ReturnType<typeof toCardData>[] = [];
  let failed = false;
  try {
    const res = await searchMedia({
      search: q || undefined,
      type,
      format: (format || undefined) as MediaFormat | undefined,
      perPage: 24,
    });
    items = res.items.map(toCardData);
  } catch {
    failed = true;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <span className="h-6 w-1.5 rounded-full bg-gradient-to-b from-primary to-accent" />
        <h1 className="font-display text-2xl font-bold tracking-tight">Browse</h1>
      </div>
      <SearchControls initial={{ q, type, format }} />
      {failed ? (
        <p className="rounded-2xl border border-dashed border-border py-12 text-center text-sm text-muted-foreground">
          Search is unavailable right now. Please try again later.
        </p>
      ) : (
        <MediaGrid items={items} />
      )}
    </div>
  );
}
