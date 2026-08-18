export function AffinityBars({
  positive,
  negative,
}: {
  positive: { name: string; affinity: number }[];
  negative: { name: string; affinity: number }[];
}) {
  const max = Math.max(1, ...positive.map((t) => t.affinity), ...negative.map((t) => Math.abs(t.affinity)));
  const Row = ({ name, affinity, color }: { name: string; affinity: number; color: string }) => (
    <li className="flex items-center gap-3">
      <span className="w-28 shrink-0 truncate text-xs text-muted-foreground" title={name}>{name}</span>
      <span className="relative h-3 flex-1 overflow-hidden rounded-full bg-background">
        <span
          className="absolute inset-y-0 left-0 rounded-full"
          style={{ width: `${(Math.abs(affinity) / max) * 100}%`, backgroundColor: color }}
        />
      </span>
    </li>
  );
  return (
    <div className="grid gap-6 sm:grid-cols-2">
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-accent">You love</p>
        {positive.length === 0 ? (
          <p className="text-sm text-muted-foreground">Not enough data yet.</p>
        ) : (
          <ul className="space-y-2">
            {positive.map((t) => <Row key={t.name} name={t.name} affinity={t.affinity} color="var(--color-accent)" />)}
          </ul>
        )}
      </div>
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-destructive">Not your thing</p>
        {negative.length === 0 ? (
          <p className="text-sm text-muted-foreground">Not enough data yet.</p>
        ) : (
          <ul className="space-y-2">
            {negative.map((t) => <Row key={t.name} name={t.name} affinity={t.affinity} color="var(--color-destructive)" />)}
          </ul>
        )}
      </div>
    </div>
  );
}
