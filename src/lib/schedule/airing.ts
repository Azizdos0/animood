import type { Media, NextAiringEpisode } from "@/lib/anilist/types";

/** "in 2d 4h", "in 3h 20m", "in 45m", or "out now" once the time has passed. */
export function formatCountdown(airingAt: number, nowMs: number): string {
  const ms = airingAt * 1000 - nowMs;
  if (ms <= 0) return "out now";
  const total = Math.ceil(ms / 60_000); // whole minutes, rounded up so "in 0m" never shows
  const days = Math.floor(total / 1440);
  const hours = Math.floor((total % 1440) / 60);
  const minutes = total % 60;
  if (days > 0) return `in ${days}d${hours ? ` ${hours}h` : ""}`;
  if (hours > 0) return `in ${hours}h${minutes ? ` ${minutes}m` : ""}`;
  return `in ${minutes}m`;
}

/**
 * Episodes already out that the viewer hasn't logged. A cached `nextAiringEpisode`
 * whose time has passed counts as aired, so stale data never under-reports.
 */
export function episodesBehind(progress: number, next: NextAiringEpisode | null | undefined, nowMs: number): number {
  if (!next) return 0;
  const released = next.airingAt * 1000 <= nowMs ? next.episode : next.episode - 1;
  return Math.max(0, released - progress);
}

export interface ScheduleItem { media: Media; episode: number; airingAt: number; mine: boolean }
export interface ScheduleDay { key: string; label: string; date: Date; items: ScheduleItem[] }

const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;

/**
 * Buckets next episodes into `days` local calendar days starting today (the viewer's
 * timezone: call this in the browser). Earlier and later episodes are dropped;
 * a show listed twice keeps its "mine" copy.
 */
export function groupByDay(media: { media: Media; mine: boolean }[], nowMs: number, days = 7): ScheduleDay[] {
  const start = new Date(nowMs);
  start.setHours(0, 0, 0, 0);
  const buckets: ScheduleDay[] = [];
  for (let i = 0; i < days; i++) {
    const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    const label = i === 0 ? "Today" : i === 1 ? "Tomorrow" : date.toLocaleDateString(undefined, { weekday: "long" });
    buckets.push({ key: dayKey(date), label, date, items: [] });
  }
  const byKey = new Map(buckets.map((b) => [b.key, b]));
  const seen = new Map<number, ScheduleItem>();
  for (const { media: m, mine } of media) {
    const next = m.nextAiringEpisode;
    if (!next) continue;
    const existing = seen.get(m.id);
    if (existing) { existing.mine ||= mine; continue; }
    const bucket = byKey.get(dayKey(new Date(next.airingAt * 1000)));
    if (!bucket) continue;
    const item = { media: m, episode: next.episode, airingAt: next.airingAt, mine };
    seen.set(m.id, item);
    bucket.items.push(item);
  }
  for (const b of buckets) b.items.sort((a, z) => a.airingAt - z.airingAt || a.media.title.localeCompare(z.media.title));
  return buckets;
}
