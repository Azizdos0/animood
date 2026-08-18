import { getTrending } from "@/lib/anilist/media";
import { MediaRow, toCardData } from "@/components/MediaRow";

export default async function HomePage() {
  try {
    const [anime, manga] = await Promise.all([
      getTrending("ANIME", 12),
      getTrending("MANGA", 12),
    ]);
    return (
      <div className="space-y-10">
        <MediaRow title="Trending Anime" items={anime.map(toCardData)} />
        <MediaRow title="Trending Manga" items={manga.map(toCardData)} />
      </div>
    );
  } catch {
    return (
      <p className="py-12 text-center text-sm opacity-70">
        Couldn&apos;t load trending titles right now. Please try again later.
      </p>
    );
  }
}
