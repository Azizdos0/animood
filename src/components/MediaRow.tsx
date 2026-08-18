import type { Media } from "@/lib/anilist/types";
import { MediaCard, type MediaCardData } from "./MediaCard";

export function toCardData(m: Media): MediaCardData {
  return { id: m.id, title: m.title, coverImage: m.coverImage, format: m.format };
}

export function MediaRow({ title, items }: { title: string; items: MediaCardData[] }) {
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold">{title}</h2>
      <div className="flex gap-4 overflow-x-auto pb-2">
        {items.map((m) => (
          <div key={m.id} className="w-32 shrink-0">
            <MediaCard media={m} />
          </div>
        ))}
      </div>
    </section>
  );
}
