"use client";

import { useState } from "react";
import Link from "next/link";
import { importEntries } from "@/lib/list/reactive";
import { STATUS_LABELS } from "@/lib/list/labels";
import type { ImportEntry } from "@/lib/import/mal";
import { SparklesIcon } from "@/components/icons";

type Phase = "idle" | "uploading" | "preview" | "importing" | "done" | "error";

interface Preview {
  matched: ImportEntry[];
  unmatched: number;
  total: number;
}

const ERROR_COPY: Record<string, string> = {
  invalid_file: "That doesn't look like a MyAnimeList export. Export your list from MAL (Settings → Export) and upload the .xml or .xml.gz file.",
  no_files: "Pick your MAL export file first.",
  fetch_failed: "Couldn't reach AniList to match your titles. Please try again in a moment.",
  invalid_request: "Something went wrong reading the upload. Please try again.",
};

export function MalImportView() {
  const [files, setFiles] = useState<File[]>([]);
  const [phase, setPhase] = useState<Phase>("idle");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState<string>("");
  const [importedCount, setImportedCount] = useState(0);

  async function runImport() {
    if (files.length === 0) return;
    setPhase("uploading");
    setError("");
    const form = new FormData();
    for (const f of files) form.append("files", f);
    try {
      const res = await fetch("/api/import/mal", { method: "POST", body: form });
      const body = await res.json();
      if (!res.ok) {
        setError(ERROR_COPY[body.error] ?? "Import failed. Please try again.");
        setPhase("error");
        return;
      }
      setPreview(body as Preview);
      setPhase("preview");
    } catch {
      setError(ERROR_COPY.fetch_failed);
      setPhase("error");
    }
  }

  function confirmImport() {
    if (!preview) return;
    setPhase("importing");
    importEntries(
      preview.matched.map((m) => ({
        mediaId: m.mediaId,
        status: m.status,
        score: m.score,
        progress: m.progress,
      }))
    );
    setImportedCount(preview.matched.length);
    setPhase("done");
  }

  function reset() {
    setFiles([]);
    setPreview(null);
    setError("");
    setPhase("idle");
  }

  if (phase === "done") {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border py-16 text-center">
        <SparklesIcon size={40} className="text-accent" />
        <p className="mt-3 font-display text-2xl font-extrabold">Imported {importedCount} titles</p>
        <p className="mt-1 text-sm text-muted-foreground">Your list and recommendations are ready.</p>
        <div className="mt-5 flex gap-3">
          <Link href="/my-list" className="rounded-xl bg-gradient-to-r from-primary-strong to-accent px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-primary/25 transition-transform hover:scale-[1.03]">
            View my list
          </Link>
          <button type="button" onClick={reset} className="rounded-xl border border-border-strong bg-surface px-5 py-2.5 text-sm font-semibold transition-colors hover:bg-surface-hover">
            Import another
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* How-to */}
      <div className="rounded-2xl border border-border bg-surface/50 p-5 text-sm text-muted-foreground">
        <p className="font-medium text-foreground">How to export from MyAnimeList</p>
        <ol className="mt-2 list-decimal space-y-1 pl-5">
          <li>On MyAnimeList, go to <span className="text-foreground">Profile → Settings → Export</span>.</li>
          <li>Export your Anime list and/or Manga list (you&apos;ll get <code className="rounded bg-background px-1">.xml.gz</code> files).</li>
          <li>Upload the file(s) below — we&apos;ll match them to our database.</li>
        </ol>
      </div>

      {/* Picker */}
      <div className="rounded-2xl border border-border bg-surface/60 p-5">
        <label className="flex flex-col gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">MAL export file(s)</span>
          <input
            type="file"
            accept=".xml,.gz,application/gzip,text/xml"
            multiple
            onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
            className="text-sm text-muted-foreground file:mr-3 file:rounded-lg file:border-0 file:bg-primary-strong file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-primary"
          />
        </label>
        {files.length > 0 ? (
          <p className="mt-3 text-xs text-muted-foreground">{files.map((f) => f.name).join(", ")}</p>
        ) : null}
        <button
          type="button"
          disabled={files.length === 0 || phase === "uploading"}
          onClick={runImport}
          className="mt-4 rounded-xl bg-gradient-to-r from-primary-strong to-accent px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-primary/25 transition-transform enabled:hover:scale-[1.03] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {phase === "uploading" ? "Matching titles…" : "Import"}
        </button>
      </div>

      {phase === "error" ? (
        <p className="rounded-2xl border border-dashed border-destructive/50 bg-destructive/10 p-4 text-sm text-foreground">{error}</p>
      ) : null}

      {/* Preview */}
      {phase === "preview" && preview ? (
        <div className="space-y-4 rounded-2xl border border-border bg-surface/60 p-5">
          <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
            <p className="font-display text-lg font-bold">Preview</p>
            <p className="text-sm text-muted-foreground">
              <span className="font-semibold text-foreground">{preview.matched.length}</span> matched
              {" · "}
              <span className="font-semibold text-foreground">{preview.unmatched}</span> couldn&apos;t be matched
              {" · "}
              {preview.total} total
            </p>
          </div>

          {preview.matched.length === 0 ? (
            <p className="text-sm text-muted-foreground">None of these titles matched our database. Nothing to import.</p>
          ) : (
            <>
              <div className="grid grid-cols-4 gap-3 sm:grid-cols-6 md:grid-cols-8">
                {preview.matched.slice(0, 24).map((m) => (
                  <div key={m.mediaId} className="space-y-1">
                    <div className="relative aspect-[2/3] overflow-hidden rounded-lg border border-border bg-background">
                      {m.coverImage ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={m.coverImage} alt={m.title} className="h-full w-full object-cover" loading="lazy" />
                      ) : null}
                      <span className="absolute left-1 top-1 rounded bg-primary-strong/90 px-1 py-0.5 text-[9px] font-semibold uppercase text-white">
                        {STATUS_LABELS[m.status]}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
              {preview.matched.length > 24 ? (
                <p className="text-xs text-muted-foreground">+ {preview.matched.length - 24} more</p>
              ) : null}
              <div className="flex gap-3 pt-1">
                <button
                  type="button"
                  onClick={confirmImport}
                  className="rounded-xl bg-gradient-to-r from-primary-strong to-accent px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-primary/25 transition-transform hover:scale-[1.03]"
                >
                  Add {preview.matched.length} titles to my list
                </button>
                <button type="button" onClick={reset} className="rounded-xl border border-border px-5 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-surface-hover">
                  Cancel
                </button>
              </div>
              <p className="text-xs text-muted-foreground">Existing entries for these titles will be overwritten with your MAL data.</p>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
