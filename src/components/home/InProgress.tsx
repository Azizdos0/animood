"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useListStore, setEntry } from "@/lib/list/reactive";
import type { Media } from "@/lib/anilist/types";

const ACCENTS = ["var(--pink)", "var(--violet)", "var(--foreground)"];

export function InProgress() {
  const store = useListStore();
  const entries = Object.entries(store.entries);
  const watchingIds = entries.filter(([, e]) => e.status === "watching").map(([id]) => Number(id));
  const watching = watchingIds.length;
  const planning = entries.filter(([, e]) => e.status === "planning").length;
  const completed = entries.filter(([, e]) => e.status === "completed").length;

  const key = watchingIds.slice(0, 6).join(",");
  const [media, setMedia] = useState<Record<number, Media>>({});

  useEffect(() => {
    if (key === "") return;
    const controller = new AbortController();
    fetch(`/api/media?ids=${key}`, { signal: controller.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((body: { items: Media[] }) => {
        const map: Record<number, Media> = {};
        for (const m of body.items) map[m.id] = m;
        setMedia(map);
      })
      .catch(() => {});
    return () => controller.abort();
  }, [key]);

  const rows = useMemo(() => watchingIds.slice(0, 3), [key]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <section className="mx-auto max-w-[1560px] px-6 pb-16 sm:px-10">
      <div className="grid gap-11 rounded-3xl border border-border bg-surface p-6 sm:p-9 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <div>
          <div className="mono text-[11px] tracking-[0.16em] text-pink">02 / IN PROGRESS</div>
          <h2 className="mb-3.5 mt-3 text-[clamp(24px,3vw,32px)] font-black tracking-[-0.035em]">
            Pick up where you dropped off
          </h2>
          <p className="max-w-sm text-[15px] leading-relaxed text-muted-foreground">
            Episode counts stay in this browser. No account, no sync nag, no ads — just your list.
          </p>
          <div className="mt-8 flex gap-7">
            <Stat n={watching} label="WATCHING" />
            <Stat n={planning} label="PLANNING" />
            <Stat n={completed} label="COMPLETED" accent />
          </div>
        </div>

        <div className="flex flex-col gap-3">
          {rows.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center rounded-2xl border border-dashed border-border py-12 text-center">
              <p className="text-sm font-medium">Nothing in progress.</p>
              <Link
                href="/search"
                className="mono mt-3 text-[12px] tracking-[0.1em] text-pink hover:underline"
              >
                FIND SOMETHING TO WATCH ↗
              </Link>
            </div>
          ) : (
            rows.map((id, i) => {
              const m = media[id];
              const entry = store.entries[id];
              const total = m ? (m.type === "ANIME" ? m.episodes : m.chapters) : null;
              const pct = total ? Math.min(100, Math.round((entry.progress / total) * 100)) : 0;
              const unit = m?.type === "MANGA" ? "CH" : "EP";
              return (
                <div key={id} className="flex items-center gap-4 rounded-2xl border border-border bg-surface-2 p-3.5">
                  <Link href={`/media/${id}`} className="h-16 w-11 shrink-0 overflow-hidden rounded-lg stripe-fill">
                    {m?.coverImage ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={m.coverImage} alt="" className="h-full w-full object-cover" />
                    ) : null}
                  </Link>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-3">
                      <Link href={`/media/${id}`} className="truncate text-[15px] font-extrabold hover:text-pink">
                        {m?.title ?? "…"}
                      </Link>
                      <span className="mono shrink-0 text-[10px] text-muted-2">
                        {unit} {entry.progress}{total ? ` / ${total}` : ""}
                      </span>
                    </div>
                    <div className="mt-2.5 h-1 overflow-hidden rounded-full bg-border-strong">
                      <div className="h-full rounded-full" style={{ width: `${pct}%`, background: ACCENTS[i % 3] }} />
                    </div>
                  </div>
                  <button
                    type="button"
                    aria-label="Add one episode"
                    onClick={() => setEntry(id, { progress: entry.progress + 1 })}
                    className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-border-strong text-[13px] transition-colors hover:bg-foreground hover:text-on-accent"
                  >
                    +1
                  </button>
                </div>
              );
            })
          )}
        </div>
      </div>
    </section>
  );
}

function Stat({ n, label, accent }: { n: number; label: string; accent?: boolean }) {
  return (
    <div>
      <div className={`text-[38px] font-black leading-none tracking-[-0.04em] ${accent ? "text-violet" : ""}`}>{n}</div>
      <div className="mono mt-1.5 text-[10px] text-muted-2">{label}</div>
    </div>
  );
}
