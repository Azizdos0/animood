"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";
import { isSupabaseConfigured, supabaseBrowser } from "@/lib/supabase/client";
import { getSnapshot, subscribe, replaceStore } from "@/lib/list/reactive";
import { mergeLists } from "@/lib/sync/merge";
import { pullCloud, reconcileCloud } from "@/lib/sync/cloud";

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

export function SyncProvider({ children }: { children: React.ReactNode }) {
  const configured = isSupabaseConfigured();
  const [user, setUser] = useState<AuthUser | null>(null);
  const userIdRef = useRef<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!configured) return;
    const supabase = supabaseBrowser();
    let unsubStore: (() => void) | null = null;

    async function onSignedIn(userId: string, u: AuthUser) {
      userIdRef.current = userId;
      setUser(u);
      try {
        const rows = await pullCloud(supabase, userId);
        const merged = mergeLists(getSnapshot(), rows);
        replaceStore(merged);
        await reconcileCloud(supabase, userId, merged);
      } catch {
        // sync failure is non-fatal; local store keeps working.
      }
      unsubStore?.();
      unsubStore = subscribe(() => {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => {
          const uid = userIdRef.current;
          if (uid) reconcileCloud(supabase, uid, getSnapshot()).catch(() => {});
        }, 1000);
      });
    }

    function onSignedOut() {
      userIdRef.current = null;
      setUser(null);
      unsubStore?.();
      unsubStore = null;
    }

    supabase.auth.getUser().then(({ data }) => {
      if (data.user) {
        onSignedIn(data.user.id, {
          email: data.user.email ?? null,
          avatarUrl: (data.user.user_metadata?.avatar_url as string) ?? null,
        });
      }
    });

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
