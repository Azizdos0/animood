"use client";

import Link from "next/link";
import { useAuth } from "@/components/SyncProvider";

export function AuthButton() {
  const { user, configured, signIn, signOut, username, syncStatus, retrySync } = useAuth();

  if (!configured) {
    return (
      <div className="mono flex items-center gap-2 rounded-full border border-border-strong px-3.5 py-2 text-[11px] text-muted-foreground">
        <span className="pulse-dot h-1.5 w-1.5 rounded-full bg-violet" />
        <span>SAVED ON THIS DEVICE</span>
      </div>
    );
  }

  if (!user) {
    return (
      <button
        type="button"
        onClick={signIn}
        className="rounded-full bg-foreground px-4 py-2 text-[12px] font-extrabold text-background transition-colors hover:bg-pink"
      >
        Sign in
      </button>
    );
  }

  const avatarContent = user.avatarUrl ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={user.avatarUrl}
      alt={user.email ?? "Account"}
      className="h-8 w-8 rounded-full object-cover"
    />
  ) : (
    (user.email ?? "?").slice(0, 1).toUpperCase()
  );

  const avatarClassName =
    "grid h-8 w-8 place-items-center overflow-hidden rounded-full bg-gradient-to-br from-pink to-violet text-[12px] font-black text-on-accent";

  return (
    <div className="flex flex-wrap items-center justify-end gap-2.5 sm:flex-nowrap">
      <div role="status" className={`mono items-center gap-2 rounded-full border border-border-strong px-2 py-2 text-[10px] text-muted-foreground sm:px-3.5 sm:text-[11px] ${syncStatus === "error" ? "flex" : "hidden sm:flex"}`}>
        <span className="pulse-dot hidden h-1.5 w-1.5 rounded-full bg-pink sm:block" />
        <span>{syncStatus === "synced" ? "SYNCED · CLOUD" : syncStatus === "error" ? "SYNC PAUSED" : "SYNCING…"}</span>
        {syncStatus === "error" && (
          <button type="button" onClick={retrySync} aria-label="Retry sync" title="Your changes are pending. Retry cloud sync."
            className="font-bold text-pink hover:underline">Retry</button>
        )}
      </div>
      <button
        type="button"
        onClick={() => signOut()}
        className="mono text-[10px] font-bold text-muted-foreground transition-colors hover:text-foreground"
      >
        Sign out
      </button>
      {username ? (
        <Link
          href={`/u/${username}`}
          aria-label="Your profile"
          title={user.email ?? "Signed in"}
          className={avatarClassName}
        >
          {avatarContent}
        </Link>
      ) : (
        <div title={user.email ?? "Signed in"} className={avatarClassName}>
          {avatarContent}
        </div>
      )}
    </div>
  );
}
