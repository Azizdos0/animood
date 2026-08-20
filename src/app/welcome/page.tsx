import { Suspense } from "react";
import { WelcomeForm } from "@/components/WelcomeForm";
import { PageHead } from "@/components/editorial";

export default function WelcomePage() {
  return (
    <div className="mx-auto max-w-[1560px] space-y-8 px-6 py-12 sm:px-10">
      <PageHead kicker="ONE LAST STEP" accent="violet">
        Claim your username
      </PageHead>
      <Suspense fallback={null}>
        <WelcomeForm />
      </Suspense>
    </div>
  );
}
