import Link from "next/link";
import type { UserResult } from "@/lib/discover/types";

export function UserCard({ user }: { user: UserResult }) {
  const name = user.displayName ?? user.username;
  const initial = (name || "?").slice(0, 1).toUpperCase();

  return (
    <Link
      href={`/u/${user.username}`}
      className="flex items-center gap-4 rounded-2xl border border-border bg-surface/40 p-4 transition-colors hover:bg-surface/70"
    >
      <div className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-full bg-gradient-to-br from-pink to-violet text-base font-black text-on-accent">
        {user.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={user.avatarUrl}
            alt={name}
            className="h-12 w-12 rounded-full object-cover"
          />
        ) : (
          initial
        )}
      </div>
      <div className="min-w-0">
        <div className="truncate font-display text-[15px] font-bold tracking-tight">{name}</div>
        <div className="mono mt-0.5 text-[12px] text-muted-2">@{user.username}</div>
      </div>
    </Link>
  );
}
