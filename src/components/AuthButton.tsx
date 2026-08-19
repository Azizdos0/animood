"use client";

import { useAuth } from "@/components/SyncProvider";

export function AuthButton() {
  const { user, configured, signIn, signOut } = useAuth();

  if (!configured) {
    return (
      <div className="mono flex items-center gap-2 rounded-full border border-border-strong px-3.5 py-2 text-[11px] text-muted-foreground">
        <span className="pulse-dot h-1.5 w-1.5 rounded-full bg-violet" />
        <span>SYNCED · LOCAL</span>
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

  return (
    <div className="flex items-center gap-2.5">
      <div className="mono hidden items-center gap-2 rounded-full border border-border-strong px-3.5 py-2 text-[11px] text-muted-foreground sm:flex">
        <span className="pulse-dot h-1.5 w-1.5 rounded-full bg-pink" />
        <span>SYNCED · CLOUD</span>
      </div>
      <button
        type="button"
        onClick={() => signOut()}
        title={user.email ?? "Signed in"}
        className="grid h-8 w-8 place-items-center rounded-full bg-gradient-to-br from-pink to-violet text-[12px] font-black text-on-accent"
      >
        {(user.email ?? "?").slice(0, 1).toUpperCase()}
      </button>
    </div>
  );
}
