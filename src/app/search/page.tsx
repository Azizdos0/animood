import { searchMedia } from "@/lib/anilist/media";
import type { MediaFormat, MediaType } from "@/lib/anilist/types";
import { MediaGrid } from "@/components/MediaGrid";
import { toCardData } from "@/components/MediaRow";
import { SearchControls } from "@/components/SearchControls";
import { PageHead } from "@/components/editorial";

export const dynamic = "force-dynamic";

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; type?: string; format?: string; genre?: string }>;
}) {
  const sp = await searchParams;
  const type: MediaType = sp.type === "MANGA" ? "MANGA" : "ANIME";
  const q = sp.q ?? "";
  const format = sp.format ?? "";
  const genre = sp.genre ?? "";

  let items: ReturnType<typeof toCardData>[] = [];
  let failed = false;
  try {
    const res = await searchMedia({
      search: q || undefined,
      type,
      genre: genre || undefined,
      format: (format || undefined) as MediaFormat | undefined,
      sort: q ? undefined : "TRENDING_DESC",
      perPage: 30,
    });
    items = res.items.map(toCardData);
  } catch {
    failed = true;
  }

  return (
    <div className="mx-auto max-w-[1560px] space-y-8 px-6 py-12 sm:px-10">
      <PageHead kicker={`SEARCH · ${genre ? genre.toUpperCase() : "12,480 TITLES INDEXED"}`} accent="violet">
        {genre ? genre : "Browse everything"}
      </PageHead>
      <SearchControls initial={{ q, type, format }} />
      {failed ? (
        <p className="mono rounded-2xl border border-dashed border-border py-14 text-center text-xs tracking-[0.14em] text-muted-2">
          SEARCH UNAVAILABLE — TRY AGAIN LATER
        </p>
      ) : (
        <MediaGrid items={items} />
      )}
    </div>
  );
}
