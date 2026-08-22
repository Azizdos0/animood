import { notFound } from "next/navigation";
import { loadProfilePage, type ProfilePageState } from "@/lib/profile/server";
import { ProfileHeader } from "@/components/profile/ProfileHeader";
import { ProfileOwnerBar } from "@/components/profile/ProfileOwnerBar";
import { ProfileContent } from "@/components/profile/ProfileContent";
import { FollowButton } from "@/components/profile/FollowButton";

export default async function ProfilePage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = await params;
  const res: ProfilePageState = await loadProfilePage(username).catch(
    () => ({ state: "not_found" as const })
  );

  if (res.state === "not_found") notFound();

  return (
    <div className="mx-auto max-w-[1560px] space-y-8 px-6 py-12 sm:px-10">
      <ProfileHeader profile={res.profile} isOwner={res.isOwner} followCounts={res.followCounts} />

      {res.state === "private" ? (
        <div className="rounded-2xl border border-dashed border-border bg-surface/40 p-10 text-center">
          <p className="font-display text-lg font-bold tracking-tight">This profile is private</p>
          <p className="mono mt-2 text-[12px] tracking-[0.06em] text-muted-2">
            Only the owner can see this list.
          </p>
        </div>
      ) : (
        <>
          {res.isOwner ? (
            <ProfileOwnerBar userId={res.profile.userId} isPublic={res.profile.isPublic} />
          ) : (
            <FollowButton targetUserId={res.profile.userId} initialFollowing={res.viewerFollows} />
          )}
          <ProfileContent entries={res.entries} />
        </>
      )}
    </div>
  );
}
