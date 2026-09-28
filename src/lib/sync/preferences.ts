import {
  DISCOVERY_EVENT, readPreferencesRecord, removePreferencesRecord, sanitizePreferences, writePreferencesRecord,
  type Preferences, type PreferencesRecord,
} from "@/lib/recommend/preferences";
import type { SupaLike } from "./cloud";
import type { SyncStatus } from "./session";

const TABLE = "discovery_preferences";
const EPOCH = new Date(0).toISOString();
// Table or RPC not deployed yet (migration 0014 pending): stay quiet, don't retry.
const NOT_DEPLOYED = new Set(["PGRST205", "PGRST202", "42P01", "42883"]);
const CHECK_VIOLATION = "23514";

interface CloudRow {
  seeds: unknown; hidden_ids: number[]; diversity: number; excluded_genres: string[]; client_updated_at: string;
}

const time = (value: string | null): number => (value ? Date.parse(value) : -Infinity);
const hasContent = (p: Preferences) =>
  p.seeds.length > 0 || p.hiddenIds.length > 0 || p.excludedGenres.length > 0 || p.diversity !== 0.3;

/** Version for comparisons. Pre-sync data with content counts as the oldest version:
 * it uploads to an empty cloud but never overwrites an existing row. */
export function localVersion(record: PreferencesRecord | null): string | null {
  if (!record) return null;
  return record.updatedAt ?? (hasContent(record.prefs) ? EPOCH : null);
}

/** Guest preferences follow the list's claim rule: the next account to sign in takes them. */
export function claimGuestPreferences(userId: string): void {
  const guest = readPreferencesRecord(null);
  if (!guest) return;
  const version = localVersion(guest);
  if (version && time(version) > time(localVersion(readPreferencesRecord(userId)))) {
    writePreferencesRecord(userId, { prefs: guest.prefs, updatedAt: version, syncedAt: null });
  }
  removePreferencesRecord(null);
}

/** Owns one account's preference sync. A stopped session never writes local storage. */
export function startPreferencesSync(client: SupaLike, userId: string, status: (value: SyncStatus) => void) {
  let active = true;
  let running = false;
  let applying = false;
  let pulled = false;
  let deployed = true;
  let failures = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const requests = new AbortController();

  function schedule(delay: number) {
    clearTimeout(timer);
    timer = setTimeout(() => { void run(); }, delay);
  }
  function apply(record: PreferencesRecord) {
    applying = true;
    try { writePreferencesRecord(userId, record); }
    finally { applying = false; }
  }

  async function pull(): Promise<CloudRow | null> {
    const { data, error } = await client.from(TABLE)
      .select("seeds,hidden_ids,diversity,excluded_genres,client_updated_at")
      .eq("user_id", userId).abortSignal(requests.signal).maybeSingle();
    if (error) throw error;
    return (data ?? null) as CloudRow | null;
  }

  async function run() {
    if (!active || !deployed || running) return;
    running = true;
    clearTimeout(timer);
    status("syncing");
    try {
      // Bounded: each round either finishes, re-pulls a newer version, or pushes once.
      for (let round = 0; round < 5; round++) {
        if (!pulled) {
          const row = await pull();
          if (!active) return;
          if (row && time(row.client_updated_at) > time(localVersion(readPreferencesRecord(userId)))) {
            apply({
              prefs: sanitizePreferences({ seeds: row.seeds as Preferences["seeds"], hiddenIds: row.hidden_ids,
                diversity: row.diversity, excludedGenres: row.excluded_genres }),
              updatedAt: row.client_updated_at, syncedAt: row.client_updated_at,
            });
          }
          pulled = true;
        }
        const local = readPreferencesRecord(userId);
        const version = localVersion(local);
        if (!local || !version || time(local.syncedAt) >= time(version)) {
          failures = 0;
          status("synced");
          return;
        }
        const { data: stored, error } = await client.rpc("save_discovery_preferences", {
          p_seeds: local.prefs.seeds, p_hidden_ids: local.prefs.hiddenIds, p_diversity: local.prefs.diversity,
          p_excluded_genres: local.prefs.excludedGenres, p_client_updated_at: version,
        }).abortSignal(requests.signal);
        if (!active) return;
        if (error) throw error;
        // Another device saved a newer version: take it instead.
        if (typeof stored === "string" && time(stored) > time(version)) { pulled = false; continue; }
        // Acknowledge only what was sent; an edit made in flight pushes next round.
        const latest = readPreferencesRecord(userId);
        if (latest) apply({ ...latest, syncedAt: version });
      }
      schedule(1000);
    } catch (err) {
      if (!active) return;
      const code = (err as { code?: unknown } | null)?.code;
      if (typeof code === "string" && NOT_DEPLOYED.has(code)) { deployed = false; status("local"); return; }
      status("error");
      // A rejected document would fail identically on retry; wait for a new edit.
      if (code !== CHECK_VIOLATION) schedule(Math.min(30000, 2000 * 2 ** Math.min(failures++, 4)));
    } finally {
      running = false;
    }
  }

  try { claimGuestPreferences(userId); } catch { /* storage unavailable: keep guest data */ }
  const onChange = () => {
    if (!active || !deployed || applying) return;
    status("syncing");
    schedule(1000);
  };
  const retry = () => { if (active) schedule(0); };
  window.addEventListener(DISCOVERY_EVENT, onChange);
  window.addEventListener("online", retry);
  schedule(0);
  return {
    retry,
    stop() {
      active = false;
      requests.abort();
      clearTimeout(timer);
      window.removeEventListener(DISCOVERY_EVENT, onChange);
      window.removeEventListener("online", retry);
    },
  };
}
