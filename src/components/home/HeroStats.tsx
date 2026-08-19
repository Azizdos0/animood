"use client";

import { useListStore } from "@/lib/list/reactive";

export function HeroStats() {
  const store = useListStore();
  const entries = Object.values(store.entries);
  const total = entries.length;
  const completed = entries.filter((e) => e.status === "completed").length;
  const watching = entries.filter((e) => e.status === "watching").length;

  return (
    <div className="col-span-3 flex items-center justify-between gap-5 rounded-2xl border border-border bg-surface-2 px-5 py-[18px]">
      <div>
        <div className="mono text-[10px] tracking-[0.14em] text-muted-2">YOUR LIST</div>
        <div className="mt-1.5 text-[15px] font-bold">
          {total > 0 ? `${total} titles tracked` : "Empty — start tracking"}
        </div>
      </div>
      <div className="flex gap-6 text-right">
        <div>
          <div className="text-[26px] font-black leading-none tracking-[-0.03em] text-pink">{completed}</div>
          <div className="mono mt-1 text-[10px] text-muted-2">COMPLETED</div>
        </div>
        <div>
          <div className="text-[26px] font-black leading-none tracking-[-0.03em]">{watching}</div>
          <div className="mono mt-1 text-[10px] text-muted-2">WATCHING</div>
        </div>
      </div>
    </div>
  );
}
