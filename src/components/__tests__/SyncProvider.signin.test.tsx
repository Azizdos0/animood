import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act, fireEvent } from "@testing-library/react";

const h = vi.hoisted(() => ({
  oauth: vi.fn(async (_opts?: unknown) => ({ error: null as unknown })),
  signOut: vi.fn(async (_opts?: unknown) => ({ error: null as unknown })),
}));

vi.mock("@/lib/supabase/client", () => ({
  isSupabaseConfigured: () => true,
  supabaseBrowser: () => ({
    auth: {
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
      signInWithOAuth: (opts: unknown) => h.oauth(opts),
      signOut: (opts?: unknown) => h.signOut(opts),
    },
  }),
}));

import { SyncProvider, useAuth } from "@/components/SyncProvider";

function Probe() {
  const { authError, signIn, signOut } = useAuth();
  return (
    <div>
      <div>authError:{String(authError)}</div>
      <button onClick={signIn}>sign in</button>
      <button onClick={() => void signOut()}>sign out</button>
    </div>
  );
}
const press = (name: string) => act(async () => { fireEvent.click(screen.getByRole("button", { name })); });

describe("SyncProvider sign-in", () => {
  beforeEach(() => {
    h.oauth.mockClear();
    h.signOut.mockClear();
    window.history.replaceState(null, "", "/");
  });

  it("returns the user to the page they signed in from", async () => {
    window.history.replaceState(null, "", "/media/42?tab=cast");
    render(<SyncProvider><Probe /></SyncProvider>);
    await press("sign in");
    const opts = h.oauth.mock.calls[0][0] as { provider: string; options: { redirectTo: string } };
    expect(opts.provider).toBe("google");
    // The callback URL stays exact so it matches Supabase's redirect allow-list.
    expect(opts.options.redirectTo).toBe(`${window.location.origin}/auth/callback`);
    expect(document.cookie).toContain(`animood-auth-next=${encodeURIComponent("/media/42?tab=cast")}`);
  });

  it("reports a failed sign-in start instead of doing nothing", async () => {
    h.oauth.mockResolvedValueOnce({ error: new Error("provider disabled") });
    render(<SyncProvider><Probe /></SyncProvider>);
    await press("sign in");
    expect(screen.getByText("authError:true")).toBeInTheDocument();
  });

  it("surfaces ?authError=1 from the callback once and strips it from the URL", async () => {
    window.history.replaceState(null, "", "/schedule?authError=1&day=mon");
    render(<SyncProvider><Probe /></SyncProvider>);
    expect(await screen.findByText("authError:true")).toBeInTheDocument();
    expect(window.location.pathname + window.location.search).toBe("/schedule?day=mon");
  });

  it("still signs out on this device when the server call fails", async () => {
    h.signOut.mockResolvedValueOnce({ error: new Error("offline") });
    render(<SyncProvider><Probe /></SyncProvider>);
    await press("sign out");
    expect(h.signOut).toHaveBeenLastCalledWith({ scope: "local" });
  });
});
