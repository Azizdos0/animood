export function BarList({
  items,
  accent = "var(--color-primary)",
}: {
  items: { name: string; count: number }[];
  accent?: string;
}) {
  if (items.length === 0) {
    return <p className="py-6 text-center text-sm text-muted-foreground">No data yet.</p>;
  }
  const max = Math.max(...items.map((i) => i.count), 1);
  return (
    <ul className="space-y-2">
      {items.map((i) => (
        <li key={i.name} className="flex items-center gap-3">
          <span className="w-28 shrink-0 truncate text-xs text-muted-foreground" title={i.name}>
            {i.name}
          </span>
          <span className="relative h-4 flex-1 overflow-hidden rounded-full bg-background">
            <span
              className="absolute inset-y-0 left-0 rounded-full"
              style={{ width: `${(i.count / max) * 100}%`, backgroundColor: accent }}
            />
          </span>
          <span className="w-8 shrink-0 text-right text-xs font-medium tabular-nums">{i.count}</span>
        </li>
      ))}
    </ul>
  );
}
