import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

// Unconfigured Supabase → provider is inert but renders children and reports configured=false.
vi.mock("@/lib/supabase/client", () => ({
  isSupabaseConfigured: () => false,
  supabaseBrowser: () => { throw new Error("not configured"); },
}));

import { SyncProvider, useAuth } from "@/components/SyncProvider";

function Probe() {
  const { configured, user } = useAuth();
  return <div>configured:{String(configured)} user:{user ? "yes" : "no"}</div>;
}

describe("SyncProvider (unconfigured)", () => {
  beforeEach(() => { localStorage.clear(); });

  it("renders children and reports not-configured without touching Supabase", () => {
    render(<SyncProvider><Probe /></SyncProvider>);
    expect(screen.getByText(/configured:false user:no/)).toBeInTheDocument();
  });
});
