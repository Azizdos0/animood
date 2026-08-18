"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { MediaType } from "@/lib/anilist/types";

export interface SearchControlsState {
  q: string;
  type: MediaType;
  format: string;
}

const FORMATS = ["", "TV", "MOVIE", "OVA", "ONA", "SPECIAL", "MANGA", "NOVEL"];

const fieldClass =
  "rounded-xl border border-border bg-surface px-3 py-2.5 text-sm text-foreground transition-colors focus:border-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40";

export function SearchControls({ initial }: { initial: SearchControlsState }) {
  const router = useRouter();
  const [q, setQ] = useState(initial.q);
  const [type, setType] = useState<MediaType>(initial.type);
  const [format, setFormat] = useState(initial.format);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    params.set("type", type);
    if (format) params.set("format", format);
    router.push(`/search?${params.toString()}`);
  }

  return (
    <form
      onSubmit={submit}
      className="flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-surface/50 p-3 backdrop-blur"
    >
      <input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search titles…"
        className={`min-w-48 flex-1 ${fieldClass}`}
      />
      <select
        aria-label="Type"
        value={type}
        onChange={(e) => setType(e.target.value as MediaType)}
        className={fieldClass}
      >
        <option value="ANIME">Anime</option>
        <option value="MANGA">Manga</option>
      </select>
      <select
        aria-label="Format"
        value={format}
        onChange={(e) => setFormat(e.target.value)}
        className={fieldClass}
      >
        {FORMATS.map((f) => (
          <option key={f} value={f}>
            {f || "Any format"}
          </option>
        ))}
      </select>
      <button
        type="submit"
        className="rounded-xl bg-gradient-to-r from-primary-strong to-accent px-5 py-2.5 text-sm font-semibold text-white shadow-md shadow-primary/20 transition-transform hover:scale-[1.03]"
      >
        Search
      </button>
    </form>
  );
}
