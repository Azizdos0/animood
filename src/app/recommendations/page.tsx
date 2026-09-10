import { RecommendationsView } from "@/components/RecommendationsView";
import { PageHead } from "@/components/editorial";
import { getMood } from "@/lib/recommend/moods";

export default async function RecommendationsPage({ searchParams }: { searchParams: Promise<{ mood?: string; type?: string }> }) {
  const params = await searchParams;
  return (
    <div className="mx-auto max-w-[1560px] space-y-8 px-6 py-12 sm:px-10">
      <PageHead kicker="THE ANIMOOD DISCOVERY ROOM" accent="pink">
        What do you want{" "}
        <span className="italic text-foreground/40">to feel?</span>
      </PageHead>
      <RecommendationsView moodId={getMood(params.mood)?.id ?? null} mediaType={params.type === "MANGA" ? "MANGA" : "ANIME"} />
    </div>
  );
}
