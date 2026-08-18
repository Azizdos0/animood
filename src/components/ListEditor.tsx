"use client";

import { LIST_STATUSES, type ListStatus } from "@/lib/list/schema";
import { useListEntry, setEntry, deleteEntry } from "@/lib/list/reactive";

const SCORES = [10, 9, 8, 7, 6, 5, 4, 3, 2, 1];

export function ListEditor({ mediaId }: { mediaId: number }) {
  const entry = useListEntry(mediaId);

  if (!entry) {
    return (
      <button
        type="button"
        onClick={() => setEntry(mediaId, { status: "planning" })}
        className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500"
      >
        Add to list
      </button>
    );
  }

  return (
    <div className="flex flex-wrap items-end gap-3">
      <label className="flex flex-col text-xs font-medium">
        Status
        <select
          aria-label="Status"
          value={entry.status}
          onChange={(e) => setEntry(mediaId, { status: e.target.value as ListStatus })}
          className="mt-1 rounded border bg-transparent px-2 py-1 text-sm"
        >
          {LIST_STATUSES.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </label>

      <label className="flex flex-col text-xs font-medium">
        Score
        <select
          aria-label="Score"
          value={entry.score ?? ""}
          onChange={(e) =>
            setEntry(mediaId, { score: e.target.value ? Number(e.target.value) : null })
          }
          className="mt-1 rounded border bg-transparent px-2 py-1 text-sm"
        >
          <option value="">–</option>
          {SCORES.map((n) => (
            <option key={n} value={n}>{n}</option>
          ))}
        </select>
      </label>

      <label className="flex flex-col text-xs font-medium">
        Progress
        <input
          aria-label="Progress"
          type="number"
          min={0}
          value={entry.progress}
          onChange={(e) => setEntry(mediaId, { progress: Number(e.target.value) })}
          className="mt-1 w-20 rounded border bg-transparent px-2 py-1 text-sm"
        />
      </label>

      <button
        type="button"
        onClick={() => deleteEntry(mediaId)}
        className="rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-red-500 hover:text-white"
      >
        Remove
      </button>
    </div>
  );
}
