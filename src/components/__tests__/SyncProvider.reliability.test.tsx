import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CloudRow } from "@/lib/sync/types";

const h = vi.hoisted(() => ({
  auth: null as null | ((event: string, session: unknown) => void),
  rows: new Map<string, CloudRow[]>(),
  pullFailures: 0,
  writeFailures: 0,
  deleteFailures: 0,
  pullGate: null as null | Promise<void>,
  writeGate: null as null | Promise<void>,
  writes: [] as CloudRow[][],
  signals: [] as AbortSignal[],
  committedFailure: false,
}));
vi.mock("@/lib/supabase/client", () => ({
  isSupabaseConfigured: () => true,
  supabaseBrowser: () => ({ auth: {
    onAuthStateChange: (cb: typeof h.auth) => {
      h.auth = cb;
      return { data: { subscription: { unsubscribe: () => {} } } };
    },
    signOut: async () => { h.auth?.("SIGNED_OUT", null); return { error: null }; },
  } }),
}));
vi.mock("@/lib/profile/queries", () => ({ getProfileByUserId: async () => null }));
// Only the network boundary is replaced. Storage, merging, subscriptions and
// the provider run unchanged; assertions inspect the resulting cloud records.
vi.mock("@/lib/sync/cloud", () => ({
  pullCloud: async (_client: unknown, uid: string, signal: AbortSignal) => {
    h.signals.push(signal);
    const rows = [...(h.rows.get(uid) ?? [])];
    const gate = h.pullGate; h.pullGate = null;
    if (gate) await gate;
    if (h.pullFailures > 0) { h.pullFailures--; throw new Error("offline"); }
    return rows;
  },
  pushEntries: async (_client: unknown, uid: string, entries: { mediaId: number; entry: { status: CloudRow["status"]; score: number | null; progress: number; updatedAt: string; isFavorite: boolean } }[]) => {
    if (!entries.length) return;
    const rows = entries.map(({ mediaId, entry }) => ({ user_id: uid, media_id: mediaId,
      status: entry.status, score: entry.score, progress: entry.progress,
      updated_at: entry.updatedAt, is_favorite: entry.isFavorite }));
    h.writes.push(rows);
    const gate = h.writeGate; h.writeGate = null;
    if (gate) await gate;
    if (h.writeFailures > 0) { h.writeFailures--; throw new Error("offline"); }
    const current = new Map((h.rows.get(uid) ?? []).map(r => [r.media_id, r]));
    for (const row of rows) current.set(row.media_id, row);
    h.rows.set(uid, [...current.values()]);
    if (h.committedFailure) { h.committedFailure = false; throw new Error("response lost"); }
  },
  deleteEntries: async (_client: unknown, uid: string, ids: number[]) => {
    if (!ids.length) return;
    if (h.deleteFailures > 0) { h.deleteFailures--; throw new Error("offline"); }
    h.rows.set(uid, (h.rows.get(uid) ?? []).filter(r => !ids.includes(r.media_id)));
  },
}));

import { SyncProvider, useAuth } from "@/components/SyncProvider";
import { __resetListCacheForTests, deleteEntry, getSnapshot, setEntry } from "@/lib/list/reactive";
import { setListOwner } from "@/lib/sync/owner";
import { LIST_STORAGE_KEY } from "@/lib/list/storage";

function Probe() {
  const auth = useAuth();
  return <span>{auth.syncStatus}</span>;
}
const cloudRow = (id: number): CloudRow => ({ user_id: "A", media_id: id,
  status: "watching", score: 8, progress: 2, updated_at: "2026-01-01T00:00:00Z", is_favorite: false });
async function tick(ms = 0) { await act(async () => { await vi.advanceTimersByTimeAsync(ms); }); }
async function auth(uid: string | null) {
  await act(async () => { h.auth?.(uid ? "SIGNED_IN" : "SIGNED_OUT", uid ? { user: { id: uid, email: `${uid}@test.com` } } : null); });
  await tick();
}
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(r => { resolve = r; });
  return { promise, resolve };
}
beforeEach(() => {
  localStorage.clear(); __resetListCacheForTests(); vi.useFakeTimers();
  h.rows.clear(); h.writes = []; h.auth = null;
  h.pullFailures = 0; h.writeFailures = 0; h.deleteFailures = 0;
  h.pullGate = null; h.writeGate = null;
  h.signals = []; h.committedFailure = false;
});
afterEach(() => { cleanup(); vi.useRealTimers(); localStorage.clear(); __resetListCacheForTests(); });

describe("account isolation and reliable sync", () => {
  it("keeps A's list private after sign-out and never uploads it to B", async () => {
    setEntry(1, { score: 9 });
    render(<SyncProvider><Probe /></SyncProvider>);
    await auth("A");
    await auth(null);
    expect(getSnapshot().entries).toEqual({});
    await auth("B");
    expect(h.rows.get("B") ?? []).toEqual([]);
    expect(getSnapshot().entries).toEqual({});
    await auth("A");
    expect(getSnapshot().entries[1].score).toBe(9);
  });

  it("archives a legacy owned list without showing or merging it into B", async () => {
    localStorage.setItem(LIST_STORAGE_KEY, JSON.stringify({ version: 1, entries: {
      1: { status: "planning", score: 9, progress: 0, updatedAt: "2026-01-01T00:00:00Z", isFavorite: false },
    } }));
    setListOwner("A"); __resetListCacheForTests();
    render(<SyncProvider><Probe /></SyncProvider>);
    await auth("B");
    expect(getSnapshot().entries).toEqual({});
    await auth("A");
    expect(getSnapshot().entries[1].score).toBe(9);
  });

  it("retries a failed write without needing another edit", async () => {
    render(<SyncProvider><Probe /></SyncProvider>); await auth("A");
    h.writeFailures = 1;
    act(() => setEntry(1, { progress: 3 })); await tick(1000);
    expect(screen.getByText("error")).toBeInTheDocument();
    expect(h.rows.get("A") ?? []).toEqual([]);
    await tick(30000);
    expect(h.rows.get("A")?.[0].progress).toBe(3);
    expect(screen.getByText("synced")).toBeInTheDocument();
  });

  it("retries a failed initial pull and preserves edits made while offline", async () => {
    h.rows.set("A", [cloudRow(2)]); h.pullFailures = 1;
    render(<SyncProvider><Probe /></SyncProvider>); await auth("A");
    act(() => setEntry(1, { progress: 3 }));
    await tick(30000);
    expect(h.rows.get("A")?.map(r => r.media_id).sort()).toEqual([1, 2]);
    expect(getSnapshot().entries[1].progress).toBe(3);
    expect(getSnapshot().entries[2].progress).toBe(2);
  });

  it("ignores an old account's delayed pull after switching to another account", async () => {
    h.rows.set("A", [cloudRow(1)]);
    const gate = deferred(); h.pullGate = gate.promise;
    render(<SyncProvider><Probe /></SyncProvider>); await auth("A");
    await auth("B");
    expect(h.signals[0].aborted).toBe(true);
    expect(h.signals[1].aborted).toBe(false);
    await act(async () => gate.resolve()); await tick();
    act(() => setEntry(2, { progress: 4 })); await tick(1000);
    expect(Object.keys(getSnapshot().entries)).toEqual(["2"]);
    expect(h.rows.get("B")?.map(r => r.media_id)).toEqual([2]);
  });

  it("does not acknowledge a newer edit when an older write completes", async () => {
    render(<SyncProvider><Probe /></SyncProvider>); await auth("A");
    const gate = deferred(); h.writeGate = gate.promise;
    act(() => setEntry(1, { progress: 1 })); await tick(1000);
    act(() => setEntry(1, { progress: 2 })); await tick(1000);
    expect(h.writes).toHaveLength(1);
    await act(async () => gate.resolve()); await tick(1000);
    expect(h.rows.get("A")?.[0].progress).toBe(2);
  });

  it("retains a failed deletion across provider restart instead of resurrecting it", async () => {
    h.rows.set("A", [cloudRow(1)]);
    const mounted = render(<SyncProvider><Probe /></SyncProvider>); await auth("A");
    h.deleteFailures = 1;
    act(() => deleteEntry(1)); await tick(1000);
    mounted.unmount(); __resetListCacheForTests();
    render(<SyncProvider><Probe /></SyncProvider>); await auth("A");
    expect(getSnapshot().entries).toEqual({});
    expect(h.rows.get("A")).toEqual([]);
  });

  it("preserves an offline edit when signing out and back in", async () => {
    render(<SyncProvider><Probe /></SyncProvider>); await auth("A");
    act(() => setEntry(1, { progress: 7 }));
    await auth(null); await tick(30000);
    expect(h.rows.get("A") ?? []).toEqual([]);
    await auth("B");
    expect(h.rows.get("B") ?? []).toEqual([]);
    await auth("A");
    expect(h.rows.get("A")?.[0].progress).toBe(7);
  });

  it("tracks a successful insert when the same batch's deletion fails", async () => {
    h.rows.set("A", [cloudRow(1)]);
    render(<SyncProvider><Probe /></SyncProvider>); await auth("A");
    h.deleteFailures = 1;
    act(() => { setEntry(2, { progress: 3 }); deleteEntry(1); });
    await tick(1000);
    // The insert succeeded; removing it during the retry delay must delete it
    // from the cloud too, even though the previous batch partially failed.
    act(() => deleteEntry(2)); await tick(30000);
    expect(h.rows.get("A")).toEqual([]);
  });

  it("accepts a remote deletion instead of re-uploading an unchanged local copy", async () => {
    h.rows.set("A", [cloudRow(1)]);
    const mounted = render(<SyncProvider><Probe /></SyncProvider>); await auth("A");
    mounted.unmount();
    h.rows.set("A", []); __resetListCacheForTests();
    render(<SyncProvider><Probe /></SyncProvider>); await auth("A");
    expect(getSnapshot().entries).toEqual({});
    expect(h.rows.get("A")).toEqual([]);
  });

  it("retries immediately when the browser comes back online", async () => {
    render(<SyncProvider><Probe /></SyncProvider>); await auth("A");
    h.writeFailures = 1;
    act(() => setEntry(1, { progress: 3 })); await tick(1000);
    act(() => window.dispatchEvent(new Event("online"))); await tick();
    expect(h.rows.get("A")?.[0].progress).toBe(3);
  });

  it("remembers a possibly committed write when its response is lost and the user removes it", async () => {
    const mounted = render(<SyncProvider><Probe /></SyncProvider>); await auth("A");
    h.committedFailure = true;
    act(() => setEntry(1, { progress: 3 })); await tick(1000);
    act(() => deleteEntry(1));
    mounted.unmount(); __resetListCacheForTests();
    render(<SyncProvider><Probe /></SyncProvider>); await auth("A");
    expect(getSnapshot().entries).toEqual({});
    expect(h.rows.get("A")).toEqual([]);
  });

  it("cancels retries on unmount while keeping unsent edits for the next session", async () => {
    const mounted = render(<SyncProvider><Probe /></SyncProvider>); await auth("A");
    h.writeFailures = 1;
    act(() => setEntry(1, { progress: 3 })); await tick(1000);
    mounted.unmount(); await tick(60000);
    expect(h.signals[0].aborted).toBe(true);
    expect(h.rows.get("A") ?? []).toEqual([]);
    render(<SyncProvider><Probe /></SyncProvider>); await auth("A");
    expect(h.rows.get("A")?.[0].progress).toBe(3);
  });
});
