"use client";

import Link from "next/link";
import { useListEntry } from "@/lib/list/reactive";
import { STATUS_LABELS } from "@/lib/list/labels";

export interface MediaCardData {
  id: number;
  title: string;
  coverImage: string | null;
  format?: string | null;
}

export function MediaCard({ media, rank }: { media: MediaCardData; rank?: number }) {
  const entry = useListEntry(media.id);

  return (
    <Link href={`/media/${media.id}`} className="group flex flex-col gap-3 focus:outline-none">
      <div className="relative aspect-[2/3] overflow-hidden rounded-2xl border border-border stripe-fill shadow-sm transition-all duration-300 group-hover:-translate-y-1 group-hover:border-pink/50 group-hover:shadow-[0_18px_40px_-16px_oklch(0.72_0.19_20/0.5)] group-focus-visible:border-pink">
        {media.coverImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={media.coverImage}
            alt={media.title}
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.06]"
          />
        ) : (
          <span className="mono absolute inset-0 grid place-items-center text-[10px] tracking-[0.1em] text-muted-2">
            COVER ART
          </span>
        )}

        {rank !== undefined ? (
          <span
            className={`mono absolute left-2.5 top-2.5 rounded-full bg-background/85 px-2.5 py-1 text-[9px] tracking-[0.1em] ${
              rank === 1 ? "text-pink" : "text-muted-foreground"
            }`}
          >
            #{rank}
          </span>
        ) : entry ? (
          <span className="mono absolute left-2.5 top-2.5 rounded-full bg-pink px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[0.08em] text-on-accent">
            {STATUS_LABELS[entry.status]}
          </span>
        ) : null}

        {media.format ? (
          <span className="mono absolute bottom-2.5 right-2.5 rounded-md bg-background/80 px-2 py-1 text-[9px] tracking-[0.08em]">
            {media.format}
          </span>
        ) : null}
      </div>

      <div className="line-clamp-2 text-[15px] font-extrabold leading-tight tracking-[-0.015em] transition-colors group-hover:text-pink">
        {media.title}
      </div>
    </Link>
  );
}
