import { describe, it, expect, vi, beforeEach } from "vitest";

const exchange = vi.fn(async (..._args: unknown[]) => ({ error: null as unknown }));
vi.mock("@/lib/supabase/client", () => ({ isSupabaseConfigured: () => true }));
vi.mock("@/lib/supabase/server", () => ({
  supabaseServer: async () => ({ auth: { exchangeCodeForSession: (...a: unknown[]) => exchange(...a) } }),
}));

import { GET } from "../route";

const call = async (query: string) => {
  const res = await GET(new Request(`https://animood.test/auth/callback?${query}`));
  return new URL(res.headers.get("location")!);
};

describe("auth callback", () => {
  beforeEach(() => { exchange.mockClear(); vi.spyOn(console, "error").mockImplementation(() => {}); });

  it("exchanges the code and returns to the requested page", async () => {
    const to = await call(`code=abc&next=${encodeURIComponent("/media/42?tab=cast")}`);
    expect(exchange).toHaveBeenCalledWith("abc");
    expect(to.pathname + to.search).toBe("/media/42?tab=cast");
  });

  it("ignores an off-site next target", async () => {
    const to = await call(`code=abc&next=${encodeURIComponent("//evil.com")}`);
    expect(to.origin).toBe("https://animood.test");
    expect(to.pathname).toBe("/");
  });

  it("flags a cancelled Google consent instead of failing silently", async () => {
    const to = await call("error=access_denied&error_description=cancelled&next=%2Fschedule");
    expect(exchange).not.toHaveBeenCalled();
    expect(to.pathname).toBe("/schedule");
    expect(to.searchParams.get("authError")).toBe("1");
  });

  it("flags a failed code exchange", async () => {
    exchange.mockResolvedValueOnce({ error: new Error("bad code") });
    const to = await call("code=abc");
    expect(to.searchParams.get("authError")).toBe("1");
  });
});
