"use client";

import { useState } from "react";
import { svgDataUrl, downloadSvg, downloadPng } from "@/lib/stats/download";

export function ShareCard({ svg }: { svg: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  async function png() {
    setBusy(true);
    setError(false);
    try {
      await downloadPng(svg);
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-2xl border border-border">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={svgDataUrl(svg)} alt="Your Animood stats card" className="block w-full" />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={png}
          disabled={busy}
          className="rounded-xl bg-gradient-to-r from-primary-strong to-accent px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-primary/25 transition-transform enabled:hover:scale-[1.03] disabled:opacity-50"
        >
          {busy ? "Rendering…" : "Download PNG"}
        </button>
        <button
          type="button"
          onClick={() => downloadSvg(svg)}
          className="rounded-xl border border-border-strong bg-surface px-5 py-2.5 text-sm font-semibold transition-colors hover:bg-surface-hover"
        >
          Download SVG
        </button>
        {error ? <span className="text-xs text-destructive">Couldn&apos;t render the PNG — try the SVG.</span> : null}
      </div>
    </div>
  );
}
