import { notFound } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { loadCommunityThread } from "@/lib/communities/server";
import { CommunityThreadView } from "@/components/communities/CommunityThreadView";

export default async function CommunityThreadPage({ params }: { params: Promise<{ slug: string; threadId: string }> }) {
  const { slug, threadId } = await params;
  const supabase = await supabaseServer();
  const { data } = await supabase.auth.getUser();
  const res = await loadCommunityThread(slug, threadId, data.user?.id ?? null);
  if (res.state === "not_found") notFound();
  return (
    <div className="mx-auto max-w-[900px] space-y-6 px-6 py-12 sm:px-10">
      <div>
        <p className="mono text-[11px] tracking-[0.14em] text-violet">
          <a href={`/communities/${slug}`} className="hover:underline">{res.community.name.toUpperCase()}</a>
        </p>
        <h1 className="mt-2 text-3xl font-black tracking-tight">{res.thread.title}</h1>
        {res.thread.body ? <p className="mt-3 whitespace-pre-wrap text-muted-foreground">{res.thread.body}</p> : null}
      </div>
      <CommunityThreadView
        slug={slug}
        thread={res.thread}
        initialPosts={res.posts}
        viewerRole={res.viewerRole}
      />
    </div>
  );
}
