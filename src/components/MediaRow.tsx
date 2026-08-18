import type { Media } from "@/lib/anilist/types";
import { MediaCard, type MediaCardData } from "./MediaCard";

export function toCardData(m: Media): MediaCardData {
  return { id: m.id, title: m.title, coverImage: m.coverImage, format: m.format };
}

export function MediaRow({ title, items }: { title: string; items: MediaCardData[] }) {
  return (
    <section className="space-y-4">
      <div className="flex items-center gap-3">
        <span className="h-5 w-1.5 rounded-full bg-gradient-to-b from-primary to-accent" />
        <h2 className="font-display text-xl font-bold tracking-tight">{title}</h2>
      </div>
      <div className="stagger -mx-1 flex gap-4 overflow-x-auto px-1 pb-3">
        {items.map((m) => (
          <div key={m.id} className="w-32 shrink-0 sm:w-36">
            <MediaCard media={m} />
          </div>
        ))}
      </div>
    </section>
  );
}
