export function Ticker({ items }: { items: string[] }) {
  if (items.length === 0) return null;

  const Row = ({ hidden }: { hidden?: boolean }) => (
    <div className="flex shrink-0 items-center gap-8 pr-8" aria-hidden={hidden || undefined}>
      {items.map((t, i) => (
        <span key={i} className="flex items-center gap-8 whitespace-nowrap">
          <span>{t}</span>
          <span className={i % 2 === 0 ? "text-violet" : "text-pink"}>◆</span>
        </span>
      ))}
    </div>
  );

  return (
    <div className="overflow-hidden border-y border-border bg-background">
      <div className="animate-ticker mono flex w-max py-3 text-[12px] tracking-[0.14em] text-muted-2">
        <Row />
        <Row hidden />
      </div>
    </div>
  );
}
