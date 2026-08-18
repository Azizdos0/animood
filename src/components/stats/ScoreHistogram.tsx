export function ScoreHistogram({ data }: { data: { score: number; count: number }[] }) {
  const max = Math.max(...data.map((d) => d.count), 1);
  return (
    <div className="flex items-end justify-between gap-1.5" style={{ height: 160 }}>
      {data.map((d) => (
        <div key={d.score} className="flex flex-1 flex-col items-center gap-1.5">
          <div className="flex w-full flex-1 items-end">
            <div
              className="w-full rounded-t bg-gradient-to-t from-primary-strong to-accent"
              style={{ height: `${(d.count / max) * 100}%`, minHeight: d.count > 0 ? 4 : 0 }}
              title={`${d.count}`}
            />
          </div>
          <span className="text-[11px] text-muted-foreground tabular-nums">{d.score}</span>
        </div>
      ))}
    </div>
  );
}
