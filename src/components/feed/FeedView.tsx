"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { Media } from "@/lib/anilist/types";
import type { FeedItem } from "@/lib/feed/types";
import type { ListStatus } from "@/lib/list/schema";

type Status = "loading" | "error" | "ready";

const VERB: Record<ListStatus, string> = {
  completed: "completed",
  watching: "is watching",
  planning: "plans to watch",
  dropped: "dropped",
  onhold: "put on hold",
};

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const diffMs = Date.now() - then;
  const diffSec = Math.round(diffMs / 1000);
  const abs = Math.abs(diffSec);
  if (abs < 60) return "just now";
  const diffMin = Math.round(diffSec / 60);
  if (Math.abs(diffMin) < 60) return `${Math.abs(diffMin)}m ago`;
  const diffHr = Math.round(diffMin / 60);
  if (Math.abs(diffHr) < 24) return `${Math.abs(diffHr)}h ago`;
  const diffDay = Math.round(diffHr / 24);
  if (Math.abs(diffDay) < 30) return `${Math.abs(diffDay)}d ago`;
  const diffMonth = Math.round(diffDay / 30);
  if (Math.abs(diffMonth) < 12) return `${Math.abs(diffMonth)}mo ago`;
  const diffYear = Math.round(diffMonth / 12);
  return `${Math.abs(diffYear)}y ago`;
}

function Avatar({ avatarUrl, name }: { avatarUrl: string | null; name: string }) {
  const initial = (name || "?").slice(0, 1).toUpperCase();
  return (
    <div className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-full bg-gradient-to-br from-pink to-violet text-sm font-black text-on-accent">
      {avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={avatarUrl} alt={name} className="h-10 w-10 rounded-full object-cover" />
      ) : (
        initial
      )}
    </div>
  );
}

function FeedRow({ item, media }: { item: FeedItem; media: Media | undefined }) {
  const name = item.displayName ?? item.username;
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-border bg-surface/40 p-4">
      <Avatar avatarUrl={item.avatarUrl} name={name} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm">
          <Link href={`/u/${item.username}`} className="font-semibold hover:underline">
            @{item.username}
          </Link>{" "}
          <span className="text-muted-foreground">{VERB[item.status]}</span>{" "}
          {media ? (
            <Link href={`/media/${item.mediaId}`} className="font-semibold hover:underline">
              {media.title}
            </Link>
          ) : (
            <span className="skeleton inline-block h-4 w-32 align-middle" />
          )}
          {item.score != null ? (
            <span className="ml-1 text-muted-foreground">★ {item.score}</span>
          ) : null}
        </div>
        <div className="mono mt-0.5 text-[11px] text-muted-2">{relativeTime(item.updatedAt)}</div>
      </div>
    </div>
  );
}

export function FeedView({ items }: { items: FeedItem[] }) {
  const ids = [...new Set(items.map((i) => i.mediaId))];
  const [media, setMedia] = useState<Record<number, Media>>({});
  const [status, setStatus] = useState<Status>("loading");

  const idsKey = ids.join(",");
  useEffect(() => {
    if (ids.length === 0) return;
    const controller = new AbortController();
    fetch(`/api/media?ids=${idsKey}`, { signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) return setStatus("error");
        const body = (await res.json()) as { items: Media[] };
        const map: Record<number, Media> = {};
        for (const m of body.items) map[m.id] = m;
        setMedia(map);
        setStatus("ready");
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setStatus("error");
      });
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey]);

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border py-20 text-center">
        <p className="mt-1 text-sm text-muted-foreground">
          Your feed is empty. Follow people to see their activity.
        </p>
      </div>
    );
  }

  if (status === "error") {
    return (
      <p className="rounded-2xl border border-dashed border-border py-12 text-center text-sm text-muted-foreground">
        Couldn&apos;t load your feed right now. Please try again later.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {items.map((item, i) => (
        <FeedRow key={`${item.username}-${item.mediaId}-${i}`} item={item} media={media[item.mediaId]} />
      ))}
    </div>
  );
}
