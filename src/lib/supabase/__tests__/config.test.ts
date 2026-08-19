import { describe, it, expect, afterEach, vi } from "vitest";

async function freshConfig() {
  vi.resetModules();
  return await import("@/lib/supabase/client");
}

describe("isSupabaseConfigured", () => {
  afterEach(() => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  });

  it("is false when env vars are absent", async () => {
    const { isSupabaseConfigured } = await freshConfig();
    expect(isSupabaseConfigured()).toBe(false);
  });

  it("is true when both env vars are present", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://x.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
    const { isSupabaseConfigured } = await freshConfig();
    expect(isSupabaseConfigured()).toBe(true);
  });
});
