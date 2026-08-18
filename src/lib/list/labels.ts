import type { ListStatus } from "./schema";

/** Human-friendly labels for list statuses. */
export const STATUS_LABELS: Record<ListStatus, string> = {
  watching: "Watching",
  completed: "Completed",
  planning: "Planning",
  dropped: "Dropped",
  onhold: "On Hold",
};

/** Accent color (CSS) per status, for section markers and dots. */
export const STATUS_ACCENTS: Record<ListStatus, string> = {
  watching: "#22d3ee",   // cyan
  completed: "#818cf8",  // indigo
  planning: "#a855f7",   // violet
  dropped: "#f43f5e",    // rose
  onhold: "#fbbf24",     // amber
};
