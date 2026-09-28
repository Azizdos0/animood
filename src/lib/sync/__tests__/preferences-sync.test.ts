import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setListAccount } from "@/lib/list/reactive";
import {
  getDiscoverySnapshot, readPreferencesRecord, updateDiscoveryPreferences, writePreferencesRecord,
} from "@/lib/recommend/preferences";
import { claimGuestPreferences, localVersion, startPreferencesSync } from "../preferences";
import type { SupaLike } from "../cloud";

interface Row {
  seeds: unknown; hidden_ids: number[]; diversity: number; excluded_genres: string[]; client_updated_at: string;
}
const T1 = "2026-09-01T00:00:00.000Z";
const T2 = "2026-09-02T00:00:00.000Z";
const T3 = "2026-09-03T00:00:00.000Z";
const prefs = (hiddenIds: number[] = []) => ({ seeds: [], hiddenIds, diversity: 0.3, excludedGenres: [] });

/** In-memory stand-in for the table + save_discovery_preferences RPC (same stale-write rule as SQL). */
function fakeCloud(initial: Row | null = null, opts: { selectError?: unknown; rpcError?: unknown } = {}) {
  const cloud = { row: initial, selects: 0, saves: [] as Record<string, unknown>[] };
  const client: SupaLike = {
    from: () => ({
      select: () => ({ eq: () => ({ abortSignal: () => ({ maybeSingle: async () => {
        cloud.selects++;
        return opts.selectError ? { data: null, error: opts.selectError } : { data: cloud.row, error: null };
      } }) }) }),
    }),
    rpc: (_fn: string, args: Record<string, unknown>) => ({ abortSignal: async () => {
      if (opts.rpcError) return { data: null, error: opts.rpcError };
      cloud.saves.push(args);
      const version = args.p_client_updated_at as string;
      if (!cloud.row || Date.parse(version) > Date.parse(cloud.row.client_updated_at)) {
        cloud.row = { seeds: args.p_seeds, hidden_ids: args.p_hidden_ids as number[], diversity: args.p_diversity as number,
          excluded_genres: args.p_excluded_genres as string[], client_updated_at: version };
      }
      return { data: cloud.row.client_updated_at, error: null };
    } }),
  };
  return { cloud, client };
}

const flush = () => vi.advanceTimersByTimeAsync(0);
// Stop every session even when an assertion fails first, so none leaks into the next test.
const sessions: { stop(): void }[] = [];
const start = (...args: Parameters<typeof startPreferencesSync>) => {
  const session = startPreferencesSync(...args);
  sessions.push(session);
  return session;
};

beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
  setListAccount(null);
});
afterEach(() => { sessions.splice(0).forEach(s => s.stop()); vi.useRealTimers(); });

describe("preferences cloud sync", () => {
  it("stamps updatedAt on every local edit and keeps syncedAt", () => {
    setListAccount("A");
    writePreferencesRecord("A", { prefs: prefs([1]), updatedAt: T1, syncedAt: T1 });
    updateDiscoveryPreferences({ hiddenIds: [1, 2] });
    const record = readPreferencesRecord("A")!;
    expect(Date.parse(record.updatedAt!)).toBeGreaterThan(Date.parse(T1));
    expect(record.syncedAt).toBe(T1);
    expect(record.prefs.hiddenIds).toEqual([1, 2]);
  });

  it("treats pre-sync data as the oldest version, and empty defaults as nothing", () => {
    expect(localVersion({ prefs: prefs([5]), updatedAt: null, syncedAt: null })).toBe(new Date(0).toISOString());
    expect(localVersion({ prefs: prefs(), updatedAt: null, syncedAt: null })).toBeNull();
    expect(localVersion(null)).toBeNull();
  });

  it("applies a newer cloud row on a fresh device without pushing it back", async () => {
    setListAccount("A");
    const { cloud, client } = fakeCloud({ seeds: [], hidden_ids: [9], diversity: 0.8, excluded_genres: ["Horror"], client_updated_at: T2 });
    const statuses: string[] = [];
    const session = start(client, "A", s => statuses.push(s));
    await flush();
    expect(getDiscoverySnapshot()).toMatchObject({ hiddenIds: [9], diversity: 0.8, excludedGenres: ["Horror"] });
    expect(cloud.saves).toHaveLength(0);
    expect(statuses.at(-1)).toBe("synced");
    session.stop();
  });

  it("uploads pre-sync local data when the cloud is empty", async () => {
    setListAccount("A");
    localStorage.setItem("animood.list.v1.user:A.discovery.v1", JSON.stringify(prefs([4])));
    const { cloud, client } = fakeCloud();
    const session = start(client, "A", () => {});
    await flush();
    expect(cloud.row?.hidden_ids).toEqual([4]);
    expect(readPreferencesRecord("A")!.syncedAt).toBe(new Date(0).toISOString());
    session.stop();
  });

  it("never lets pre-sync local data overwrite an existing cloud row", async () => {
    setListAccount("A");
    localStorage.setItem("animood.list.v1.user:A.discovery.v1", JSON.stringify(prefs([4])));
    const { cloud, client } = fakeCloud({ seeds: [], hidden_ids: [7], diversity: 0.3, excluded_genres: [], client_updated_at: T1 });
    const session = start(client, "A", () => {});
    await flush();
    expect(cloud.saves).toHaveLength(0);
    expect(getDiscoverySnapshot().hiddenIds).toEqual([7]);
    session.stop();
  });

  it("pushes a newer local version and debounces edits", async () => {
    setListAccount("A");
    writePreferencesRecord("A", { prefs: prefs([1]), updatedAt: T3, syncedAt: null });
    const { cloud, client } = fakeCloud({ seeds: [], hidden_ids: [], diversity: 0.3, excluded_genres: [], client_updated_at: T1 });
    const session = start(client, "A", () => {});
    await flush();
    expect(cloud.row?.hidden_ids).toEqual([1]);
    updateDiscoveryPreferences({ diversity: 0.5 });
    updateDiscoveryPreferences({ diversity: 0.6 });
    updateDiscoveryPreferences({ diversity: 0.7 });
    await vi.advanceTimersByTimeAsync(999);
    expect(cloud.saves).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(cloud.saves).toHaveLength(2);
    expect(cloud.row?.diversity).toBe(0.7);
    session.stop();
  });

  it("re-pulls when the server reports a newer version from another device", async () => {
    setListAccount("A");
    const { cloud, client } = fakeCloud({ seeds: [], hidden_ids: [], diversity: 0.3, excluded_genres: [], client_updated_at: T1 });
    const session = start(client, "A", () => {});
    await flush();
    // Another device saves T3 while this one edits with an older clock (T2).
    cloud.row = { seeds: [], hidden_ids: [33], diversity: 0.3, excluded_genres: [], client_updated_at: T3 };
    writePreferencesRecord("A", { prefs: prefs([22]), updatedAt: T2, syncedAt: T1 });
    await vi.advanceTimersByTimeAsync(1000);
    expect(cloud.row.hidden_ids).toEqual([33]);
    expect(getDiscoverySnapshot().hiddenIds).toEqual([33]);
    session.stop();
  });

  it("retries failures with backoff and on reconnect", async () => {
    setListAccount("A");
    writePreferencesRecord("A", { prefs: prefs([1]), updatedAt: T2, syncedAt: null });
    const { cloud, client } = fakeCloud(null, { selectError: { code: "08006", message: "down" } });
    const statuses: string[] = [];
    const session = start(client, "A", s => statuses.push(s));
    await flush();
    expect(statuses.at(-1)).toBe("error");
    await vi.advanceTimersByTimeAsync(2000);
    expect(cloud.selects).toBe(2);
    window.dispatchEvent(new Event("online"));
    await flush();
    expect(cloud.selects).toBe(3);
    session.stop();
  });

  it("stays quiet and stops when the table is not deployed yet", async () => {
    setListAccount("A");
    const { cloud, client } = fakeCloud(null, { selectError: { code: "PGRST205", message: "not found" } });
    const statuses: string[] = [];
    const session = start(client, "A", s => statuses.push(s));
    await flush();
    await vi.advanceTimersByTimeAsync(60000);
    updateDiscoveryPreferences({ hiddenIds: [3] });
    window.dispatchEvent(new Event("online"));
    await vi.advanceTimersByTimeAsync(5000);
    expect(statuses.at(-1)).toBe("local");
    expect(statuses).not.toContain("error");
    expect(cloud.selects).toBe(1);
    session.stop();
  });

  it("does not retry a document the database rejects", async () => {
    setListAccount("A");
    writePreferencesRecord("A", { prefs: prefs([1]), updatedAt: T2, syncedAt: null });
    const { client } = fakeCloud(null, { rpcError: { code: "23514", message: "check" } });
    const statuses: string[] = [];
    const rpc = vi.spyOn(client, "rpc");
    const session = start(client, "A", s => statuses.push(s));
    await flush();
    await vi.advanceTimersByTimeAsync(60000);
    expect(statuses.at(-1)).toBe("error");
    expect(rpc).toHaveBeenCalledTimes(1);
    session.stop();
  });

  it("never writes after stop, even when a response arrives late", async () => {
    setListAccount("A");
    let release!: (v: unknown) => void;
    const client: SupaLike = {
      from: () => ({ select: () => ({ eq: () => ({ abortSignal: () => ({ maybeSingle: () => new Promise(r => { release = r; }) }) }) }) }),
      rpc: vi.fn(),
    };
    const session = start(client, "A", () => {});
    await flush();
    session.stop();
    setListAccount("B");
    release({ data: { seeds: [], hidden_ids: [66], diversity: 0.3, excluded_genres: [], client_updated_at: T3 }, error: null });
    await flush();
    expect(readPreferencesRecord("A")).toBeNull();
    expect(readPreferencesRecord("B")).toBeNull();
    expect(getDiscoverySnapshot().hiddenIds).toEqual([]);
  });

  it("claims guest preferences on sign-in when they are newer", () => {
    writePreferencesRecord(null, { prefs: prefs([8]), updatedAt: T2, syncedAt: null });
    claimGuestPreferences("A");
    expect(readPreferencesRecord("A")).toMatchObject({ prefs: { hiddenIds: [8] }, updatedAt: T2, syncedAt: null });
    expect(readPreferencesRecord(null)).toBeNull();
  });

  it("keeps the account's own newer preferences when claiming", () => {
    writePreferencesRecord("A", { prefs: prefs([1]), updatedAt: T3, syncedAt: T3 });
    writePreferencesRecord(null, { prefs: prefs([8]), updatedAt: T2, syncedAt: null });
    claimGuestPreferences("A");
    expect(readPreferencesRecord("A")!.prefs.hiddenIds).toEqual([1]);
    expect(readPreferencesRecord(null)).toBeNull();
  });
});
