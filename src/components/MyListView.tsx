"use client";

import { useListStore } from "@/lib/list/reactive";
import { MediaList } from "@/components/MediaList";

export function MyListView() {
  const store = useListStore();
  return <MediaList entries={store.entries} interactive />;
}
