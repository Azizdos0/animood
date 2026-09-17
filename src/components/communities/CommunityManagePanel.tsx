"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";
import { setMemberRole, banMember, unbanMember, deleteCommunity } from "@/lib/communities/queries";
import type { BannedMember, Community, CommunityMember, CommunityRole } from "@/lib/communities/types";

const ERROR_COPY: Record<string, string> = {
  forbidden: "You're not allowed to do that.",
  cannot_target_owner: "The owner's role can't be changed.",
  cannot_ban_owner: "The owner can't be banned.",
};

function errorMessage(code: string): string {
  return ERROR_COPY[code] ?? "Something went wrong.";
}

function Avatar({ avatarUrl, name }: { avatarUrl: string | null; name: string }) {
  const initial = (name || "?").slice(0, 1).toUpperCase();
  return (
    <div className="grid h-8 w-8 shrink-0 place-items-center overflow-hidden rounded-full bg-gradient-to-br from-pink to-violet text-xs font-black text-on-accent">
      {avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={avatarUrl} alt={name} className="h-8 w-8 rounded-full object-cover" />
      ) : (
        initial
      )}
    </div>
  );
}

export function CommunityManagePanel({
  community,
  viewerRole,
  initialMembers,
  initialBans = [],
}: {
  community: Community;
  viewerRole: CommunityRole | null;
  initialMembers: CommunityMember[];
  initialBans?: BannedMember[];
}) {
  const router = useRouter();
  const [members, setMembers] = useState(initialMembers);
  const [bans, setBans] = useState(initialBans);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isOwner = viewerRole === "owner";
  const isModerator = viewerRole === "moderator";

  async function handleSetRole(userId: string, role: CommunityRole) {
    if (pending) return;
    setPending(userId);
    setError(null);
    try {
      const res = await setMemberRole(supabaseBrowser(), community.id, userId, role);
      if (!res.ok) {
        setError(errorMessage(res.error));
        return;
      }
      setMembers((prev) => prev.map((m) => (m.userId === userId ? { ...m, role } : m)));
      router.refresh();
    } finally {
      setPending(null);
    }
  }

  async function handleBan(userId: string) {
    if (pending) return;
    setPending(userId);
    setError(null);
    try {
      const res = await banMember(supabaseBrowser(), community.id, userId);
      if (!res.ok) {
        setError(errorMessage(res.error));
        return;
      }
      const banned = members.find((m) => m.userId === userId);
      setMembers((prev) => prev.filter((m) => m.userId !== userId));
      if (banned) {
        setBans((prev) => [
          { userId: banned.userId, username: banned.username, displayName: banned.displayName, avatarUrl: banned.avatarUrl, bannedBy: null, createdAt: new Date().toISOString() },
          ...prev,
        ]);
      }
      router.refresh();
    } finally {
      setPending(null);
    }
  }

  async function handleUnban(userId: string) {
    if (pending) return;
    setPending(userId);
    setError(null);
    try {
      const res = await unbanMember(supabaseBrowser(), community.id, userId);
      if (!res.ok) {
        setError(errorMessage(res.error));
        return;
      }
      setBans((prev) => prev.filter((b) => b.userId !== userId));
      router.refresh();
    } finally {
      setPending(null);
    }
  }

  async function handleDelete() {
    if (pending) return;
    if (!window.confirm("Delete this community? This can't be undone.")) return;
    setPending("__delete__");
    setError(null);
    try {
      const res = await deleteCommunity(supabaseBrowser(), community.id);
      if (!res.ok) {
        setError(errorMessage(res.error));
        return;
      }
      router.push("/communities");
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-[clamp(24px,3.5vw,36px)] font-black leading-[0.95] tracking-[-0.03em]">
          Manage {community.name}
        </h1>
        <p className="mono mt-2 text-[11px] tracking-[0.1em] text-muted-2">
          {members.length} {members.length === 1 ? "member" : "members"}
        </p>
      </div>

      {error ? <p className="text-sm text-pink">{error}</p> : null}

      <div className="space-y-2">
        {members.map((m) => {
          const name = m.displayName || m.username;
          const canShowRoleControls = isOwner && m.role !== "owner";
          const canShowBan = m.role === "owner" ? false : isOwner || (isModerator && m.role === "member");
          const busy = pending === m.userId;
          return (
            <div
              key={m.userId}
              data-testid="member-row"
              className="flex items-center justify-between gap-3 rounded-2xl border border-border px-4 py-3"
            >
              <div className="flex min-w-0 items-center gap-3">
                <Avatar avatarUrl={m.avatarUrl} name={name} />
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold">@{m.username}</p>
                  <span className="mono text-[10px] uppercase tracking-[0.1em] text-muted-2">{m.role}</span>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {canShowRoleControls ? (
                  m.role === "moderator" ? (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => handleSetRole(m.userId, "member")}
                      className="mono rounded-full border border-border-strong px-3 py-1.5 text-[11px] disabled:opacity-40"
                    >
                      Demote
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => handleSetRole(m.userId, "moderator")}
                      className="mono rounded-full border border-border-strong px-3 py-1.5 text-[11px] disabled:opacity-40"
                    >
                      Promote
                    </button>
                  )
                ) : null}
                {canShowBan ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => handleBan(m.userId)}
                    className="mono rounded-full border border-border-strong px-3 py-1.5 text-[11px] text-pink disabled:opacity-40"
                  >
                    Ban
                  </button>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>

      {bans.length > 0 ? (
        <div className="space-y-2 border-t border-border pt-6">
          <div className="mono text-[11px] tracking-[0.1em] text-muted-2">BANNED ({bans.length})</div>
          {bans.map((b) => {
            const name = b.displayName || b.username;
            const busy = pending === b.userId;
            return (
              <div
                key={b.userId}
                data-testid="banned-row"
                className="flex items-center justify-between gap-3 rounded-2xl border border-border px-4 py-3"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <Avatar avatarUrl={b.avatarUrl} name={name} />
                  <p className="truncate text-sm font-bold">@{b.username}</p>
                </div>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => handleUnban(b.userId)}
                  className="mono rounded-full border border-border-strong px-3 py-1.5 text-[11px] disabled:opacity-40"
                >
                  Unban
                </button>
              </div>
            );
          })}
        </div>
      ) : null}

      {isOwner ? (
        <div className="border-t border-border pt-6">
          <button
            type="button"
            disabled={pending === "__delete__"}
            onClick={handleDelete}
            className="mono rounded-full border border-pink px-4 py-2 text-[12px] font-extrabold text-pink disabled:opacity-40"
          >
            Delete community
          </button>
        </div>
      ) : null}
    </div>
  );
}
