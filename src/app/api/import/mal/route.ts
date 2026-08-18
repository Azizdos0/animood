import { gunzipSync } from "node:zlib";
import { getMediaByMalIds } from "@/lib/anilist/media";
import { parseMalExport, toImportEntries, type ImportEntry } from "@/lib/import/mal";

export const runtime = "nodejs";

const MAX_ENTRIES = 20000;

function decodeFile(bytes: Uint8Array): string {
  // gzip magic bytes 1f 8b → MAL export is typically gzipped.
  if (bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b) {
    return gunzipSync(bytes).toString("utf-8");
  }
  return Buffer.from(bytes).toString("utf-8");
}

export async function POST(request: Request): Promise<Response> {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.json({ error: "invalid_request" }, { status: 400 });
  }

  // FormDataEntryValue is string | File; keep the file entries.
  const files = form.getAll("files").filter((f): f is File => typeof f !== "string");
  if (files.length === 0) {
    return Response.json({ error: "no_files" }, { status: 400 });
  }

  const matched: ImportEntry[] = [];
  let unmatched = 0;
  let total = 0;

  try {
    for (const file of files) {
      const xml = decodeFile(new Uint8Array(await file.arrayBuffer()));
      const parsed = parseMalExport(xml); // throws on non-MAL / empty
      const entries = parsed.entries.slice(0, MAX_ENTRIES);
      total += entries.length;

      const stubs = await getMediaByMalIds(entries.map((e) => e.malId), parsed.type);
      const result = toImportEntries(entries, stubs);
      matched.push(...result.matched);
      unmatched += result.unmatched.length;
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "";
    if (/MyAnimeList|list entries/i.test(message)) {
      return Response.json({ error: "invalid_file", message }, { status: 422 });
    }
    return Response.json({ error: "fetch_failed" }, { status: 502 });
  }

  return Response.json({ matched, unmatched, total });
}
