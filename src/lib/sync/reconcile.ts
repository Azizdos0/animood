import { emptyStore, type ListEntry, type ListStoreV1 } from "@/lib/list/schema";
import { mergeLists, type CloudRow } from "./merge";

function sameEntry(a: ListEntry | undefined, b: ListEntry | undefined): boolean {
  if (!a || !b) return a === b;
  return a.status === b.status && a.score === b.score && a.progress === b.progress
    && a.isFavorite === b.isFavorite
    && new Date(a.updatedAt).getTime() === new Date(b.updatedAt).getTime();
}

export function diffEntries(last: ListStoreV1, current: ListStoreV1) {
  const changed = Object.entries(current.entries)
    .filter(([id, entry]) => !sameEntry(last.entries[Number(id)], entry))
    .map(([id, entry]) => ({ mediaId: Number(id), entry }));
  const removed = Object.keys(last.entries).map(Number).filter(id => !current.entries[id]);
  return { changed, removed };
}

/** A three-way merge preserves offline edits/deletions, and accepts remote
 * changes (including deletions) when the local entry has not been edited. */
export function reconcileLists(local: ListStoreV1, baseline: ListStoreV1, rows: CloudRow[]) {
  const pending = diffEntries(baseline, local);
  const edits = emptyStore();
  for (const { mediaId, entry } of pending.changed) edits.entries[mediaId] = entry;
  const merged = mergeLists(edits, rows);
  for (const id of pending.removed) delete merged.entries[id];
  return { merged, remote: mergeLists(emptyStore(), rows) };
}
