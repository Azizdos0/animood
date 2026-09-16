import { PageHead } from "@/components/editorial";
import { CreateCommunityForm } from "@/components/communities/CreateCommunityForm";

export const metadata = { title: "Create a community" };

export default function NewCommunityPage() {
  return (
    <div className="mx-auto max-w-[720px] space-y-8 px-6 py-12 sm:px-10">
      <PageHead kicker="COMMUNITIES · NEW" accent="pink">Create a community</PageHead>
      <CreateCommunityForm />
    </div>
  );
}
