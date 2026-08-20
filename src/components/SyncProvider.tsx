"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";
import { isSupabaseConfigured, supabaseBrowser } from "@/lib/supabase/client";
import { getSnapshot, subscribe, replaceStore } from "@/lib/list/reactive";
import { emptyStore, type ListEntry, type ListStoreV1 } from "@/lib/list/schema";
import { mergeLists } from "@/lib/sync/merge";
import { pullCloud, pushEntries, deleteEntries } from "@/lib/sync/cloud";
import { getListOwner, setListOwner } from "@/lib/sync/owner";

interface AuthUser { email: string | null; avatarUrl: string | null; }
interface AuthState {
  user: AuthUser | null;
  configured: boolean;
  signIn: () => void;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AuthState>({
  user: null, configured: false, signIn: () => {}, signOut: async () => {},
});

export function useAuth(): AuthState {
  return useContext(Ctx);
}

function allEntries(store: ListStoreV1): { mediaId: number; entry: ListEntry }[] {
  return Object.entries(store.entries).map(([id, entry]) => ({ mediaId: Number(id), entry }));
}

/** Diff two snapshots: entries added/changed (missing or different updatedAt) and removed. */
function diffEntries(last: ListStoreV1, current: ListStoreV1): {
  changed: { mediaId: number; entry: ListEntry }[];
  removed: number[];
} {
  const changed: { mediaId: number; entry: ListEntry }[] = [];
  const removed: number[] = [];
  for (const [id, entry] of Object.entries(current.entries)) {
    const mediaId = Number(id);
    const prev = last.entries[mediaId];
    if (!prev || prev.updatedAt !== entry.updatedAt) changed.push({ mediaId, entry });
  }
  for (const id of Object.keys(last.entries)) {
    const mediaId = Number(id);
    if (!current.entries[mediaId]) removed.push(mediaId);
  }
  return { changed, removed };
}

export function SyncProvider({ children }: { children: React.ReactNode }) {
  const configured = isSupabaseConfigured();
  const [user, setUser] = useState<AuthUser | null>(null);
  const userIdRef = useRef<string | null>(null);
  const lastSyncedRef = useRef<ListStoreV1>(emptyStore());
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!configured) return;
    const supabase = supabaseBrowser();
    let unsubStore: (() => void) | null = null;

    async function onSignedIn(userId: string, u: AuthUser) {
      // Already synced for this user — refresh the profile view but don't re-sync
      // or re-subscribe (avoids redundant network writes and listener leaks).
      if (userIdRef.current === userId) { setUser(u); return; }
      userIdRef.current = userId;
      setUser(u);
      try {
        const rows = await pullCloud(supabase, userId);
        const owner = getListOwner();
        // Same user (or an anonymous local list) → union local with cloud so a
        // fresh device / anon migration keeps everything. A DIFFERENT previous
        // owner on a shared device → do NOT union their entries into this
        // account; start from the pulled cloud rows only.
        const merged = (owner === null || owner === userId)
          ? mergeLists(getSnapshot(), rows)
          : mergeLists(emptyStore(), rows);
        replaceStore(merged);
        // Push the whole merged list up (upsert only, never delete on sign-in)
        // so local-only additions propagate without wiping anything.
        await pushEntries(supabase, userId, allEntries(merged));
        lastSyncedRef.current = merged;
        setListOwner(userId);
      } catch {
        // sync failure is non-fatal; local store keeps working.
      }
      unsubStore?.();
      unsubStore = subscribe(() => {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => {
          const uid = userIdRef.current;
          if (!uid) return;
          const current = getSnapshot();
          const { changed, removed } = diffEntries(lastSyncedRef.current, current);
          Promise.all([
            pushEntries(supabase, uid, changed),
            deleteEntries(supabase, uid, removed),
          ]).catch(() => {});
          lastSyncedRef.current = current;
        }, 1000);
      });
    }

    function onSignedOut() {
      userIdRef.current = null;
      lastSyncedRef.current = emptyStore();
      setUser(null);
      // A lone user keeps their list as an anonymous local list; a shared
      // device's next (different) user will hit the replace path on sign-in.
      setListOwner(null);
      unsubStore?.();
      unsubStore = null;
    }

    // Rely solely on onAuthStateChange — it delivers INITIAL_SESSION, so a
    // standalone getUser() call would only duplicate the initial sync.
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        onSignedIn(session.user.id, {
          email: session.user.email ?? null,
          avatarUrl: (session.user.user_metadata?.avatar_url as string) ?? null,
        });
      } else {
        onSignedOut();
      }
    });

    return () => { sub.subscription.unsubscribe(); unsubStore?.(); };
  }, [configured]);

  function signIn() {
    if (!configured) return;
    supabaseBrowser().auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
  }

  async function signOut() {
    if (!configured) return;
    await supabaseBrowser().auth.signOut();
  }

  return <Ctx.Provider value={{ user, configured, signIn, signOut }}>{children}</Ctx.Provider>;
}
