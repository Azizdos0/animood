export function CardSkeleton() {
  return <div className="skeleton aspect-[2/3] w-full rounded-xl" />;
}

export function GridSkeleton({ count = 12 }: { count?: number }) {
  return (
    <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 sm:gap-4 md:grid-cols-5 lg:grid-cols-6">
      {Array.from({ length: count }).map((_, i) => (
        <CardSkeleton key={i} />
      ))}
    </div>
  );
}

export function RowSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div className="flex gap-4 overflow-hidden pb-2">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="w-32 shrink-0 sm:w-36">
          <CardSkeleton />
        </div>
      ))}
    </div>
  );
}

export function TileSkeleton() {
  return <div className="skeleton h-[92px] rounded-2xl" />;
}
