"use client";

import { LIST_STATUSES, type ListStatus } from "@/lib/list/schema";
import { STATUS_LABELS } from "@/lib/list/labels";
import { useListEntry, setEntry, deleteEntry } from "@/lib/list/reactive";
import { StarIcon } from "@/components/icons";

const SCORES = [10, 9, 8, 7, 6, 5, 4, 3, 2, 1];

const controlClass =
  "mt-1.5 rounded-lg border border-border bg-background px-2.5 py-1.5 text-sm text-foreground transition-colors focus:border-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40";

const labelClass = "flex flex-col text-xs font-semibold uppercase tracking-wide text-muted-foreground";

export function ListEditor({ mediaId }: { mediaId: number }) {
  const entry = useListEntry(mediaId);

  if (!entry) {
    return (
      <button
        type="button"
        onClick={() => setEntry(mediaId, { status: "planning" })}
        className="rounded-xl bg-gradient-to-r from-primary-strong to-accent px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-primary/25 transition-transform hover:scale-[1.03]"
      >
        + Add to list
      </button>
    );
  }

  return (
    <div className="flex flex-wrap items-end gap-4">
      <label className={labelClass}>
        Status
        <select
          aria-label="Status"
          value={entry.status}
          onChange={(e) => setEntry(mediaId, { status: e.target.value as ListStatus })}
          className={controlClass}
        >
          {LIST_STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABELS[s]}
            </option>
          ))}
        </select>
      </label>

      <label className={labelClass}>
        Score
        <select
          aria-label="Score"
          value={entry.score ?? ""}
          onChange={(e) =>
            setEntry(mediaId, { score: e.target.value ? Number(e.target.value) : null })
          }
          className={controlClass}
        >
          <option value="">–</option>
          {SCORES.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </label>

      <label className={labelClass}>
        Progress
        <input
          aria-label="Progress"
          type="number"
          min={0}
          value={entry.progress}
          onChange={(e) => setEntry(mediaId, { progress: Number(e.target.value) })}
          className={`${controlClass} w-24`}
        />
      </label>

      <button
        type="button"
        aria-pressed={entry.isFavorite}
        aria-label={entry.isFavorite ? "Unfavorite" : "Favorite"}
        onClick={() => setEntry(mediaId, { isFavorite: !entry.isFavorite })}
        className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${
          entry.isFavorite
            ? "border-pink bg-pink/10 text-pink"
            : "border-border text-muted-foreground hover:border-foreground"
        }`}
      >
        <StarIcon filled={entry.isFavorite} size={16} />
        {entry.isFavorite ? "Favorited" : "Favorite"}
      </button>

      <button
        type="button"
        onClick={() => deleteEntry(mediaId)}
        className="rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:border-destructive hover:bg-destructive hover:text-white"
      >
        Remove
      </button>
    </div>
  );
}
