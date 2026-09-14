import type { MediaType } from "@/lib/anilist/types";
import type { MalMediaStub } from "@/lib/anilist/media";
import type { ListStatus } from "@/lib/list/schema";

export interface MalEntry {
  malId: number;
  status: string;
  score: number;
  progress: number;
}

export interface ParsedMalExport {
  type: MediaType;
  entries: MalEntry[];
}

export interface ImportEntry {
  mediaId: number;
  malId: number;
  title: string;
  coverImage: string | null;
  status: ListStatus;
  score: number | null;
  progress: number;
}

const STATUS_MAP: Record<string, ListStatus> = {
  watching: "watching",
  reading: "watching",
  completed: "completed",
  "on-hold": "onhold",
  onhold: "onhold",
  dropped: "dropped",
  "plan to watch": "planning",
  "plan to read": "planning",
  plantowatch: "planning",
  plantoread: "planning",
};

export function mapMalStatus(malStatus: string): ListStatus {
  return STATUS_MAP[malStatus.trim().toLowerCase()] ?? "planning";
}

export function mapMalScore(malScore: number): number | null {
  if (!Number.isFinite(malScore) || malScore <= 0) return null;
  return Math.min(10, Math.round(malScore));
}

/** Extract the inner text of the first <tag>…</tag> in a block, unwrapping CDATA. */
function field(block: string, tag: string): string | null {
  const m = block.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, "i"));
  if (!m) return null;
  return m[1].replace(/^<!\[CDATA\[/, "").replace(/\]\]>$/, "").trim();
}

function toInt(value: string | null): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export function parseMalExport(xml: string): ParsedMalExport {
  if (!/<myanimelist[\s>]/i.test(xml)) {
    throw new Error("Not a MyAnimeList export file.");
  }

  const isManga = /<manga>[\s\S]*?<\/manga>/i.test(xml);
  const type: MediaType = isManga ? "MANGA" : "ANIME";
  const blockTag = isManga ? "manga" : "anime";
  const idTag = isManga ? "manga_mangadb_id" : "series_animedb_id";
  const progressTag = isManga ? "my_read_chapters" : "my_watched_episodes";

  const blocks = xml.match(new RegExp(`<${blockTag}>[\\s\\S]*?</${blockTag}>`, "gi")) ?? [];
  const entries: MalEntry[] = [];

  for (const block of blocks) {
    const malId = toInt(field(block, idTag));
    if (malId <= 0) continue;
    entries.push({
      malId,
      status: field(block, "my_status") ?? "",
      score: toInt(field(block, "my_score")),
      progress: toInt(field(block, progressTag)),
    });
  }

  if (entries.length === 0) {
    throw new Error("No list entries found in the export file.");
  }

  return { type, entries };
}

export function toImportEntries(
  entries: MalEntry[],
  stubs: MalMediaStub[]
): { matched: ImportEntry[]; unmatched: number[] } {
  const byMal = new Map<number, MalMediaStub>();
  for (const s of stubs) {
    if (s.idMal !== null) byMal.set(s.idMal, s);
  }

  const matched: ImportEntry[] = [];
  const unmatched: number[] = [];

  for (const e of entries) {
    const stub = byMal.get(e.malId);
    if (!stub) {
      unmatched.push(e.malId);
      continue;
    }
    matched.push({
      mediaId: stub.id,
      malId: e.malId,
      title: stub.title,
      coverImage: stub.coverImage,
      status: mapMalStatus(e.status),
      score: mapMalScore(e.score),
      progress: Math.max(0, e.progress),
    });
  }

  return { matched, unmatched };
}
