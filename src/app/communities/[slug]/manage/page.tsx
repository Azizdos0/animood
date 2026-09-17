import { notFound, redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { loadCommunityPage } from "@/lib/communities/server";
import { getMembers, listBans } from "@/lib/communities/queries";
import { CommunityManagePanel } from "@/components/communities/CommunityManagePanel";

export const metadata = { title: "Manage community" };

export default async function ManagePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = await supabaseServer();
  const { data } = await supabase.auth.getUser();
  const res = await loadCommunityPage(slug, data.user?.id ?? null);
  if (res.state === "not_found") notFound();
  if (res.viewerRole !== "owner" && res.viewerRole !== "moderator") redirect(`/communities/${slug}`);
  const [members, bans] = await Promise.all([
    getMembers(supabase as never, res.community.id),
    listBans(supabase as never, res.community.id),
  ]);
  return (
    <div className="mx-auto max-w-[900px] space-y-8 px-6 py-12 sm:px-10">
      <CommunityManagePanel community={res.community} viewerRole={res.viewerRole} initialMembers={members} initialBans={bans} />
    </div>
  );
}
