import type { ListStatus } from "@/lib/list/schema";

export interface FeedItem {
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  mediaId: number;
  status: ListStatus;
  score: number | null;
  updatedAt: string;
}

export type FeedState = { state: "signed_out" } | { state: "ok"; items: FeedItem[] };
