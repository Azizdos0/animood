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

export function MediaCard({ media }: { media: MediaCardData }) {
  const entry = useListEntry(media.id);

  return (
    <Link
      href={`/media/${media.id}`}
      className="group block focus:outline-none"
    >
      <div className="relative aspect-[2/3] w-full overflow-hidden rounded-xl border border-border bg-surface shadow-sm ring-1 ring-transparent transition-all duration-300 group-hover:-translate-y-1.5 group-hover:border-primary/40 group-hover:ring-primary/30 group-hover:shadow-[0_18px_40px_-14px_rgba(129,140,248,0.45)] group-focus-visible:ring-2 group-focus-visible:ring-primary">
        {media.coverImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={media.coverImage}
            alt={media.title}
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.07]"
            loading="lazy"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">
            No image
          </div>
        )}

        {/* Bottom gradient scrim for legibility */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black/85 via-black/25 to-transparent" />

        {entry ? (
          <span className="absolute left-2 top-2 rounded-md bg-primary-strong/90 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white shadow-sm backdrop-blur-sm">
            {STATUS_LABELS[entry.status]}
          </span>
        ) : null}

        <div className="absolute inset-x-0 bottom-0 p-2.5">
          <p className="line-clamp-2 text-sm font-semibold leading-tight text-white drop-shadow">
            {media.title}
          </p>
          {media.format ? (
            <p className="mt-0.5 text-[11px] font-medium uppercase tracking-wide text-white/70">
              {media.format}
            </p>
          ) : null}
        </div>
      </div>
    </Link>
  );
}
