"use client";

import { useListStore } from "@/lib/list/reactive";
import { StatsBoard } from "@/components/StatsBoard";

export function StatsView() {
  const store = useListStore();
  return <StatsBoard entries={store.entries} />;
}
