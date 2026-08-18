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
      <SearchControls initial={{ q, type, format }} />
      {failed ? (
        <p className="py-12 text-center text-sm opacity-70">
          Search is unavailable right now. Please try again later.
        </p>
      ) : (
        <MediaGrid items={items} />
      )}
    </div>
  );
}
