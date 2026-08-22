import { loadFeed } from "@/lib/feed/server";
import { FeedView } from "@/components/feed/FeedView";
import { PageHead } from "@/components/editorial";

export default async function FeedPage() {
  const res = await loadFeed().catch(() => ({ state: "signed_out" as const }));

  return (
    <div className="mx-auto max-w-[1560px] space-y-8 px-6 py-12 sm:px-10">
      <PageHead kicker="FEED · WHO YOU FOLLOW">Feed</PageHead>
      {res.state === "signed_out" ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border py-20 text-center">
          <p className="mt-1 text-sm text-muted-foreground">
            Sign in to see what the people you follow are watching.
          </p>
        </div>
      ) : (
        <FeedView items={res.items} />
      )}
    </div>
  );
}
