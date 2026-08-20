import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/supabase/client", () => ({
  isSupabaseConfigured: () => true,
  supabaseBrowser: () => ({
    auth: {
      onAuthStateChange: (cb: (e: string, s: unknown) => void) => {
        cb("INITIAL_SESSION", { user: { id: "u1", email: "a@b.c", user_metadata: {} } });
        return { data: { subscription: { unsubscribe: () => {} } } };
      },
      signInWithOAuth: vi.fn(), signOut: vi.fn(),
    },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }),
  }),
}));
vi.mock("@/lib/sync/cloud", () => ({ pullCloud: async () => [], pushEntries: async () => {}, deleteEntries: async () => {} }));

import { SyncProvider, useAuth } from "@/components/SyncProvider";
function Probe() {
  const { needsUsername } = useAuth();
  return <span>needs:{String(needsUsername)}</span>;
}

describe("SyncProvider username", () => {
  it("sets needsUsername when the signed-in user has no profile row", async () => {
    render(<SyncProvider><Probe /></SyncProvider>);
    await waitFor(() => expect(screen.getByText("needs:true")).toBeInTheDocument());
  });
});
