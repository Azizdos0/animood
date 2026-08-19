import { RecommendationsView } from "@/components/RecommendationsView";
import { PageHead } from "@/components/editorial";

export default function RecommendationsPage() {
  return (
    <div className="mx-auto max-w-[1560px] space-y-8 px-6 py-12 sm:px-10">
      <PageHead kicker="FOR YOU · BUILT FROM YOUR LIST" accent="pink">
        Your taste,{" "}
        <span className="italic text-foreground/40">read back to you.</span>
      </PageHead>
      <RecommendationsView />
    </div>
  );
}
