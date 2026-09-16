import { PageHead } from "@/components/editorial";
import { CommunityDirectory } from "@/components/communities/CommunityDirectory";

export const metadata = { title: "Communities" };

export default function CommunitiesPage() {
  return (
    <div className="mx-auto max-w-[1560px] space-y-8 px-6 py-12 sm:px-10">
      <PageHead kicker="COMMUNITIES · FIND YOUR PEOPLE" accent="violet">Communities</PageHead>
      <CommunityDirectory />
    </div>
  );
}
