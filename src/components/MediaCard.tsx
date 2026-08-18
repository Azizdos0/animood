"use client";

import Link from "next/link";
import { useListEntry } from "@/lib/list/reactive";

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
      className="group block overflow-hidden rounded-lg bg-black/5 transition hover:shadow-lg dark:bg-white/5"
    >
      <div className="relative aspect-[2/3] w-full bg-black/10 dark:bg-white/10">
        {media.coverImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={media.coverImage}
            alt={media.title}
            className="h-full w-full object-cover"
            loading="lazy"
          />
        ) : null}
        {entry ? (
          <span className="absolute left-1 top-1 rounded bg-indigo-600 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-white">
            {entry.status}
          </span>
        ) : null}
      </div>
      <div className="p-2">
        <p className="line-clamp-2 text-sm font-medium group-hover:text-indigo-500">
          {media.title}
        </p>
        {media.format ? (
          <p className="mt-0.5 text-xs opacity-60">{media.format}</p>
        ) : null}
      </div>
    </Link>
  );
}
