import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, act, cleanup } from "@testing-library/react";
import type { CloudRow } from "@/lib/sync/merge";

// Shared, mutable fake Supabase state (hoisted so the vi.mock factory can see it).
const h = vi.hoisted(() => {
  return {
    authCb: null as null | ((event: string, session: unknown) => void),
    cloudRows: [] as CloudRow[],
    pushed: [] as CloudRow[][],
    deleted: [] as number[][],
    pullCount: 0,
  };
});

vi.mock("@/lib/supabase/client", () => ({
  isSupabaseConfigured: () => true,
  supabaseBrowser: () => ({
    auth: {
      onAuthStateChange: (cb: (e: string, s: unknown) => void) => {
        h.authCb = cb;
        return { data: { subscription: { unsubscribe: () => {} } } };
      },
      signInWithOAuth: () => {},
      signOut: async () => {},
    },
    from: () => ({
      select: () => {
        let after = 0;
        const query = {
          eq: () => query, order: () => query, limit: () => query, abortSignal: () => query,
          gt: (_col: string, id: number) => { after = id; return query; },
          then: (resolve: (value: unknown) => unknown) => {
            h.pullCount++;
            return Promise.resolve(resolve({ data: h.cloudRows.filter(row => row.media_id > after), error: null }));
          },
        };
        return query;
      },
      upsert: (rows: CloudRow[]) => { h.pushed.push(rows); return { error: null, abortSignal: () => ({ error: null }) }; },
      delete: () => ({
        eq: () => ({
          in: (_col: string, ids: number[]) => { h.deleted.push(ids); return { error: null, abortSignal: () => ({ error: null }) }; },
        }),
      }),
    }),
  }),
}));

import { SyncProvider } from "@/components/SyncProvider";
import { getListOwner, setListOwner } from "@/lib/sync/owner";
import { LIST_STORAGE_KEY } from "@/lib/list/storage";
import { __resetListCacheForTests, getSnapshot } from "@/lib/list/reactive";
import { type ListEntry } from "@/lib/list/schema";

const row = (media_id: number, over: Partial<CloudRow> = {}): CloudRow => ({
  user_id: "u", media_id, status: "watching", score: null, progress: 0,
  updated_at: "2026-01-01T00:00:00.000Z", is_favorite: false, ...over,
});

const entry = (over: Partial<ListEntry> = {}): ListEntry => ({
  status: "watching", score: null, progress: 0, updatedAt: "2026-01-01T00:00:00.000Z", isFavorite: false, ...over,
});

function seedLocal(entries: Record<number, ListEntry>) {
  localStorage.setItem(LIST_STORAGE_KEY, JSON.stringify({ version: 1, entries }));
  __resetListCacheForTests();
}

function readLocal(): Record<number, ListEntry> {
  return getSnapshot().entries;
}

async function signInAs(userId: string) {
  await act(async () => {
    h.authCb?.("SIGNED_IN", { user: { id: userId, email: `${userId}@x.com`, user_metadata: {} } });
    await vi.advanceTimersByTimeAsync(0);
  });
}

beforeEach(() => {
  localStorage.clear();
  __resetListCacheForTests();
  vi.useFakeTimers();
  h.authCb = null; h.cloudRows = []; h.pushed = []; h.deleted = []; h.pullCount = 0;
});
afterEach(() => { cleanup(); vi.useRealTimers(); localStorage.clear(); __resetListCacheForTests(); });

describe("SyncProvider (configured)", () => {
  it("claims an anonymous local list and uploads only local changes", async () => {
    seedLocal({ 1: entry({ status: "completed" }) });
    h.cloudRows = [row(2, { status: "planning" })];
    render(<SyncProvider>x</SyncProvider>);

    await signInAs("user-1");

    const local = readLocal();
    expect(Object.keys(local).sort()).toEqual(["1", "2"]); // union kept both
    expect(getListOwner()).toBeNull(); // legacy shared slot has been migrated
    // Cloud-only rows do not need rewriting.
    expect(h.pushed).toHaveLength(1);
    expect(h.pushed[0].map((r) => r.media_id)).toEqual([1]);
    expect(h.deleted).toHaveLength(0);
  });

  it("on sign-in when a DIFFERENT user owned the local list: replaces with cloud only (no contamination)", async () => {
    // user-1 previously owned this device; their private entry 1 is still local.
    seedLocal({ 1: entry({ status: "completed", score: 9 }) });
    setListOwner("user-1");
    h.cloudRows = [row(5, { status: "planning" })]; // user-2's cloud
    render(<SyncProvider>x</SyncProvider>);

    await signInAs("user-2");

    const local = readLocal();
    expect(Object.keys(local)).toEqual(["5"]); // user-1's entry 1 is NOT unioned in
    expect(getListOwner()).toBeNull();
    expect(h.pushed).toHaveLength(0); // user-1's entry never reaches user-2's cloud
  });

  it("ignores a duplicate SIGNED_IN for the same user (no redundant pull)", async () => {
    h.cloudRows = [];
    render(<SyncProvider>x</SyncProvider>);

    await signInAs("user-1");
    const pullsAfterFirst = h.pullCount;
    await signInAs("user-1");

    expect(h.pullCount).toBe(pullsAfterFirst); // guard short-circuits the second run
  });

  it("on sign-out: exposes a separate empty guest list", async () => {
    h.cloudRows = [row(1)];
    render(<SyncProvider>x</SyncProvider>);
    await signInAs("user-1");
    expect(readLocal()[1]).toBeDefined();

    await act(async () => {
      h.authCb?.("SIGNED_OUT", null);
      await Promise.resolve();
    });

    expect(getListOwner()).toBeNull();
    expect(readLocal()).toEqual({});
  });
});
