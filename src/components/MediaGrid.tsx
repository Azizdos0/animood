import { MediaCard, type MediaCardData } from "./MediaCard";

export function MediaGrid({ items }: { items: MediaCardData[] }) {
  if (items.length === 0) {
    return (
      <p className="py-12 text-center text-sm opacity-60">
        Nothing here yet.
      </p>
    );
  }
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
      {items.map((m) => (
        <MediaCard key={m.id} media={m} />
      ))}
    </div>
  );
}
