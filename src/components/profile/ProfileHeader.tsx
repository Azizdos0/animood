import type { Profile } from "@/lib/profile/types";

function formatJoinDate(createdAt: string): string {
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

export function ProfileHeader({ profile, isOwner }: { profile: Profile; isOwner: boolean }) {
  const name = profile.displayName ?? profile.username;
  const initial = (name || "?").slice(0, 1).toUpperCase();
  const joinDate = formatJoinDate(profile.createdAt);

  return (
    <div className="flex items-center gap-4 rounded-2xl border border-border bg-surface/40 p-5">
      <div className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-full bg-gradient-to-br from-pink to-violet text-xl font-black text-on-accent">
        {profile.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={profile.avatarUrl}
            alt={name}
            className="h-16 w-16 rounded-full object-cover"
          />
        ) : (
          initial
        )}
      </div>
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <h1 className="truncate font-display text-lg font-bold tracking-tight">{name}</h1>
          {isOwner ? (
            <span className="mono rounded-full border border-border-strong px-2 py-0.5 text-[10px] text-muted-foreground">
              This is you
            </span>
          ) : null}
        </div>
        <div className="mono mt-0.5 text-[12px] text-muted-2">@{profile.username}</div>
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-muted-foreground">
          {joinDate ? <span>Joined {joinDate}</span> : null}
          <span className="mono">0 followers · 0 following</span>
        </div>
      </div>
    </div>
  );
}
