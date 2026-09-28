"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { isSupabaseConfigured, supabaseBrowser } from "@/lib/supabase/client";
import { setListAccount } from "@/lib/list/reactive";
import { getProfileByUserId } from "@/lib/profile/queries";
import { startListSync, type SyncStatus } from "@/lib/sync/session";
import { startPreferencesSync } from "@/lib/sync/preferences";

/** One indicator for list + preference sync. A "local" preference session (feature
 * not deployed) defers to the list; otherwise any error, then any activity, wins. */
export function combineSyncStatus(list: SyncStatus, prefs: SyncStatus): SyncStatus {
  if (prefs === "local") return list;
  if (list === "error" || prefs === "error") return "error";
  if (list === "syncing" || prefs === "syncing") return "syncing";
  return list;
}

interface AuthUser { email: string | null; avatarUrl: string | null; }
interface AuthState {
  user: AuthUser | null;
  configured: boolean;
  username: string | null;
  needsUsername: boolean;
  syncStatus: SyncStatus;
  retrySync: () => void;
  signIn: () => void;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const Ctx = createContext<AuthState>({
  user: null, configured: false, username: null, needsUsername: false,
  syncStatus: "local", retrySync: () => {},
  signIn: () => {}, signOut: async () => {}, refreshProfile: async () => {},
});

export function useAuth(): AuthState { return useContext(Ctx); }

export function SyncProvider({ children }: { children: React.ReactNode }) {
  const configured = isSupabaseConfigured();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [username, setUsername] = useState<string | null>(null);
  const [needsUsername, setNeedsUsername] = useState(false);
  const [listStatus, setListStatus] = useState<SyncStatus>("local");
  const [prefsStatus, setPrefsStatus] = useState<SyncStatus>("local");
  const identity = useRef<{ userId: string | null }>({ userId: null });
  const sync = useRef<ReturnType<typeof startListSync> | null>(null);
  const prefsSync = useRef<ReturnType<typeof startPreferencesSync> | null>(null);

  const refreshProfile = useCallback(async () => {
    const current = identity.current;
    if (!configured || !current.userId) return;
    try {
      const profile = await getProfileByUserId(supabaseBrowser(), current.userId);
      if (identity.current !== current) return;
      setUsername(profile?.username ?? null);
      setNeedsUsername(profile === null);
    } catch {
      if (identity.current === current) setNeedsUsername(false);
    }
  }, [configured]);

  useEffect(() => {
    if (!configured) return;
    const supabase = supabaseBrowser();
    let profileTimer: ReturnType<typeof setTimeout> | undefined;
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      const uid = session?.user?.id ?? null;
      const authUser = session?.user ? {
        email: session.user.email ?? null,
        avatarUrl: (session.user.user_metadata?.avatar_url as string) ?? null,
      } : null;
      setUser(authUser);
      // Token refreshes must not restart sync or discard pending changes.
      if (uid !== null && identity.current.userId === uid) return;

      sync.current?.stop();
      sync.current = null;
      prefsSync.current?.stop();
      prefsSync.current = null;
      clearTimeout(profileTimer);
      identity.current = { userId: uid };
      setUsername(null);
      setNeedsUsername(false);
      if (uid === null) {
        // Account data remains in its own namespace. Guests see a separate list.
        try { setListAccount(null); } catch { /* legacy data stays protected */ }
        setListStatus("local");
        setPrefsStatus("local");
        return;
      }
      setListStatus("syncing");
      setPrefsStatus("syncing");
      sync.current = startListSync(supabase, uid, setListStatus);
      // After the list session has selected this account's storage scope.
      prefsSync.current = startPreferencesSync(supabase, uid, setPrefsStatus);
      profileTimer = setTimeout(() => { void refreshProfile(); }, 0);
    });
    return () => {
      sub.subscription.unsubscribe();
      sync.current?.stop();
      sync.current = null;
      prefsSync.current?.stop();
      prefsSync.current = null;
      identity.current = { userId: null };
      clearTimeout(profileTimer);
    };
  }, [configured, refreshProfile]);

  function signIn() {
    if (!configured) return;
    void supabaseBrowser().auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
  }
  async function signOut() {
    if (!configured) return;
    await supabaseBrowser().auth.signOut();
  }

  return (
    <Ctx.Provider value={{ user, configured, username, needsUsername,
      syncStatus: combineSyncStatus(listStatus, prefsStatus),
      retrySync: () => { sync.current?.retry(); prefsSync.current?.retry(); }, signIn, signOut, refreshProfile }}>
      {children}
    </Ctx.Provider>
  );
}
