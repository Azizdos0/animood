import { getAiringNow } from "@/lib/anilist/media";
import type { Media } from "@/lib/anilist/types";
import { PageHead } from "@/components/editorial";
import { AiringSchedule } from "@/components/schedule/AiringSchedule";
import { pageMetadata } from "@/lib/seo";

// Rebuilt at most every 30 minutes; episode times are absolute, and countdowns run client-side.
export const revalidate = 1800;

export const metadata = pageMetadata({
  title: "Airing schedule",
  description: "Next episodes of the anime you're watching and what's airing this week, in your local time.",
});

export default async function SchedulePage() {
  let popular: Media[] = [];
  let failed = false;
  try {
    popular = await getAiringNow(50);
  } catch {
    failed = true;
  }
  return (
    <div className="mx-auto max-w-[1560px] space-y-8 px-6 py-12 sm:px-10">
      <PageHead kicker="SCHEDULE · THIS WEEK" accent="pink">
        What&apos;s airing
      </PageHead>
      <AiringSchedule popular={popular} failed={failed} />
    </div>
  );
}
