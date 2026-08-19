import { MediaCard, type MediaCardData } from "./MediaCard";

export function MediaGrid({ items }: { items: MediaCardData[] }) {
  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border py-16 text-center">
        <p className="mono text-xs tracking-[0.14em] text-muted-2">NOTHING HERE YET</p>
      </div>
    );
  }
  return (
    <div className="stagger grid grid-cols-3 gap-4 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6">
      {items.map((m) => (
        <MediaCard key={m.id} media={m} />
      ))}
    </div>
  );
}
