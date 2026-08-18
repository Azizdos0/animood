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
    <form onSubmit={submit} className="flex flex-wrap items-center gap-3">
      <input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search titles…"
        className="min-w-48 flex-1 rounded-md border bg-transparent px-3 py-2 text-sm"
      />
      <select
        aria-label="Type"
        value={type}
        onChange={(e) => setType(e.target.value as MediaType)}
        className="rounded-md border bg-transparent px-2 py-2 text-sm"
      >
        <option value="ANIME">Anime</option>
        <option value="MANGA">Manga</option>
      </select>
      <select
        aria-label="Format"
        value={format}
        onChange={(e) => setFormat(e.target.value)}
        className="rounded-md border bg-transparent px-2 py-2 text-sm"
      >
        {FORMATS.map((f) => (
          <option key={f} value={f}>{f || "Any format"}</option>
        ))}
      </select>
      <button
        type="submit"
        className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500"
      >
        Search
      </button>
    </form>
  );
}
