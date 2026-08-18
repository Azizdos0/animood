import { LIST_STATUSES, type ListStatus, type ListStoreV1 } from "./schema";

export function groupIdsByStatus(store: ListStoreV1): Record<ListStatus, number[]> {
  const grouped = Object.fromEntries(
    LIST_STATUSES.map((s) => [s, [] as number[]])
  ) as Record<ListStatus, number[]>;

  for (const [id, entry] of Object.entries(store.entries)) {
    grouped[entry.status].push(Number(id));
  }
  return grouped;
}
