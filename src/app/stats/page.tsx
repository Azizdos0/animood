import { StatsView } from "@/components/StatsView";
import { PageHead } from "@/components/editorial";

export default function StatsPage() {
  return (
    <div className="mx-auto max-w-[1560px] space-y-8 px-6 py-12 sm:px-10">
      <PageHead kicker="STATS · YOUR HABITS" accent="pink">
        By the numbers
      </PageHead>
      <StatsView />
    </div>
  );
}
