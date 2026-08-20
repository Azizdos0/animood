import type { ListStatus } from "@/lib/list/schema";

export interface CloudRow {
  user_id: string;
  media_id: number;
  status: ListStatus;
  score: number | null;
  progress: number;
  updated_at: string; // ISO timestamp
}
