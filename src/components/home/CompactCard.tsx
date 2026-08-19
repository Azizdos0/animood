import Link from "next/link";
import type { Media } from "@/lib/anilist/types";

export function CompactCard({ media }: { media: Media }) {
  const score = media.averageScore ? (media.averageScore / 20).toFixed(1) : null;
  return (
    <Link
      href={`/media/${media.id}`}
      className="group flex items-center gap-3.5 rounded-2xl border border-border bg-surface p-3 transition-colors hover:border-pink"
    >
      <div className="h-[72px] w-[52px] shrink-0 overflow-hidden rounded-lg stripe-fill">
        {media.coverImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={media.coverImage} alt={media.title} loading="lazy" className="h-full w-full object-cover" />
        ) : null}
      </div>
      <div className="min-w-0">
        <div className="line-clamp-2 text-[14px] font-extrabold leading-tight transition-colors group-hover:text-pink">
          {media.title}
        </div>
        <div className="mono mt-1.5 text-[10px] text-muted-2">
          {media.format ?? "MANGA"}
          {score ? ` · ${score}` : ""}
        </div>
      </div>
    </Link>
  );
}
