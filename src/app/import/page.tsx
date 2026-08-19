import { MalImportView } from "@/components/MalImportView";
import { PageHead } from "@/components/editorial";

export default function ImportPage() {
  return (
    <div className="mx-auto max-w-[1560px] space-y-8 px-6 py-12 sm:px-10">
      <PageHead kicker="IMPORT · FROM MYANIMELIST" accent="violet">
        Bring your list over
      </PageHead>
      <MalImportView />
    </div>
  );
}
