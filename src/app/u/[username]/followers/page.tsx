import { notFound } from "next/navigation";
import Link from "next/link";
import { loadFollowList } from "@/lib/discover/server";
import { UserCard } from "@/components/discover/UserCard";

export default async function FollowersPage({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  const res = await loadFollowList(username, "followers").catch(() => ({ state: "not_found" as const }));
  if (res.state === "not_found") notFound();
  return (
    <div className="mx-auto max-w-[1560px] space-y-8 px-6 py-12 sm:px-10">
      <Link href={`/u/${res.profile.username}`} className="mono text-[12px] text-muted-2 hover:text-foreground">← @{res.profile.username}</Link>
      <h1 className="font-display text-2xl font-bold tracking-tight">Followers of @{res.profile.username}</h1>
      {res.state === "private" ? (
        <div className="rounded-2xl border border-dashed border-border bg-surface/40 p-10 text-center">
          <p className="font-display text-lg font-bold tracking-tight">This profile is private</p>
          <p className="mono mt-2 text-[12px] tracking-[0.06em] text-muted-2">
            Only the owner can see this list.
          </p>
        </div>
      ) : res.users.length === 0 ? (
        <p className="mono rounded-2xl border border-dashed border-border py-12 text-center text-xs tracking-[0.12em] text-muted-2">NO FOLLOWERS YET</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {res.users.map((u) => <UserCard key={u.username} user={u} />)}
        </div>
      )}
    </div>
  );
}
