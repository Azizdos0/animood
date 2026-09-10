import { getSnapshot, replaceSyncedStore, setListAccount, subscribe } from "@/lib/list/reactive";
import { loadPendingIds, loadSyncBaseline } from "@/lib/list/storage";
import { deleteEntries, pullCloud, pushEntries, type SupaLike } from "./cloud";
import { diffEntries, reconcileLists } from "./reconcile";

export type SyncStatus = "local" | "syncing" | "synced" | "error";

/** Owns one account's timers and requests. Stopped sessions cannot mutate the
 * active list or acknowledge another account's changes. */
export function startListSync(client: SupaLike, userId: string, status: (value: SyncStatus) => void) {
  let active = true;
  let running = false;
  let applying = false;
  let initialized = false;
  let scopeReady = false;
  let failures = 0;
  let baseline = loadSyncBaseline();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const requests = new AbortController();

  function selectAccount() {
    applying = true;
    try { setListAccount(userId); scopeReady = true; }
    finally { applying = false; }
  }
  function apply(store: ReturnType<typeof getSnapshot>, acknowledged: typeof store, pendingIds?: number[]) {
    applying = true;
    try { replaceSyncedStore(store, acknowledged, pendingIds); }
    finally { applying = false; }
  }
  function schedule(delay: number) {
    clearTimeout(timer);
    timer = setTimeout(() => { void run(); }, delay);
  }

  async function run() {
    if (!active || running) return;
    running = true;
    clearTimeout(timer);
    status("syncing");
    try {
      if (!scopeReady) selectAccount();
      if (!initialized) {
        const rows = await pullCloud(client, userId, requests.signal);
        if (!active) return;
        const { merged, remote } = reconcileLists(getSnapshot(), loadSyncBaseline(), rows);
        // A request may have reached the server before its response was lost.
        // Keep explicit removals of those entries through reload/sign-out.
        for (const id of loadPendingIds()) {
          if (!getSnapshot().entries[id]) delete merged.entries[id];
        }
        apply(merged, remote);
        baseline = remote;
        initialized = true;
      }
      while (active) {
        const sent = getSnapshot();
        const { changed, removed } = diffEntries(baseline, sent);
        for (const id of loadPendingIds()) {
          if (!sent.entries[id] && !removed.includes(id)) removed.push(id);
        }
        if (!changed.length && !removed.length) {
          failures = 0;
          status("synced");
          return;
        }
        // Persist intent before sending; the acknowledged baseline stays intact.
        const pending = new Set([...loadPendingIds(), ...changed.map(e => e.mediaId), ...removed]);
        apply(getSnapshot(), baseline, [...pending]);
        // Wait for BOTH operations before retrying. A slow earlier write must
        // not overtake a later edit or deletion.
        const results = await Promise.allSettled([
          pushEntries(client, userId, changed, requests.signal),
          deleteEntries(client, userId, removed, requests.signal),
        ]);
        if (!active) return;
        const acknowledged = { ...baseline, entries: { ...baseline.entries } };
        if (results[0].status === "fulfilled") {
          for (const { mediaId, entry } of changed) {
            acknowledged.entries[mediaId] = entry;
            pending.delete(mediaId);
          }
        }
        if (results[1].status === "fulfilled") {
          for (const id of removed) { delete acknowledged.entries[id]; pending.delete(id); }
        }
        // Acknowledge successful operations only, preserving edits made in flight.
        apply(getSnapshot(), acknowledged, [...pending]);
        baseline = acknowledged;
        const failed = results.find(result => result.status === "rejected");
        if (failed?.status === "rejected") throw failed.reason;
      }
    } catch {
      if (active) {
        status("error");
        schedule(Math.min(30000, 2000 * 2 ** Math.min(failures++, 4)));
      }
    } finally {
      running = false;
    }
  }

  // Isolate immediately, even when the subsequent cloud pull fails.
  try { selectAccount(); } catch { status("error"); }
  const unsubscribe = subscribe(() => {
    if (!active || applying) return;
    status("syncing");
    schedule(1000);
  });
  const retry = () => { if (active) schedule(0); };
  window.addEventListener("online", retry);
  // Run after onAuthStateChange returns, outside Supabase's auth lock.
  schedule(0);
  return {
    retry,
    stop() {
      active = false;
      requests.abort();
      clearTimeout(timer);
      unsubscribe();
      window.removeEventListener("online", retry);
    },
  };
}
