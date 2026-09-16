import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { pageMetadata } from "@/lib/seo";
import { supabaseServer } from "@/lib/supabase/server";
import { loadCommunityPage } from "@/lib/communities/server";
import { CommunityHeader } from "@/components/communities/CommunityHeader";
import { CommunityBoard } from "@/components/communities/CommunityBoard";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const supabase = await supabaseServer();
  const { getCommunityBySlug } = await import("@/lib/communities/queries");
  try {
    const c = await getCommunityBySlug(supabase as never, slug);
    if (!c) return {};
    return pageMetadata({ title: c.name, description: c.description || `The ${c.name} community on Animood.` });
  } catch {
    return {};
  }
}

export default async function CommunityPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = await supabaseServer();
  const { data } = await supabase.auth.getUser();
  const res = await loadCommunityPage(slug, data.user?.id ?? null);
  if (res.state === "not_found") notFound();
  return (
    <div className="mx-auto max-w-[1560px] space-y-8 px-6 py-12 sm:px-10">
      <CommunityHeader community={res.community} viewerRole={res.viewerRole} />
      <CommunityBoard community={res.community} viewerRole={res.viewerRole} initialThreads={res.threads} />
    </div>
  );
}
