import Link from "next/link";
import type { Route } from "next";

interface Mood {
  label: string;
  tag: string;
  href: Route;
  primary?: boolean;
}

const MOODS: Mood[] = [
  { label: "Wrecked me", tag: "TRAGEDY · DRAMA", href: "/search?type=ANIME&genre=Drama", primary: true },
  { label: "Fists up", tag: "SHONEN · ACTION", href: "/search?type=ANIME&genre=Action" },
  { label: "Soft & slow", tag: "SLICE OF LIFE", href: "/search?type=ANIME&genre=Slice of Life" },
  { label: "Mind-bent", tag: "PSYCH · SCI-FI", href: "/search?type=ANIME&genre=Psychological" },
  { label: "Comfort rewatch", tag: "COMEDY", href: "/search?type=ANIME&genre=Comedy" },
];

export function MoodPicker() {
  return (
    <section className="mx-auto max-w-[1560px] px-6 py-16 sm:px-10">
      <div className="mb-6 flex flex-wrap items-baseline gap-4">
        <h2 className="text-[clamp(26px,3.4vw,34px)] font-black tracking-[-0.035em]">What&apos;s the mood?</h2>
        <span className="mono text-[11px] tracking-[0.14em] text-muted-2">PICK ONE — WE&apos;LL DO THE REST</span>
      </div>
      <div className="flex flex-wrap gap-3">
        {MOODS.map((m) => (
          <Link
            key={m.label}
            href={m.href}
            className={`flex flex-col gap-1 rounded-2xl border px-6 py-4 text-left transition-colors ${
              m.primary
                ? "border-transparent bg-pink text-on-accent"
                : "border-border-strong bg-surface hover:border-violet"
            }`}
          >
            <span className="text-[15px] font-extrabold">{m.label}</span>
            <span className={`mono text-[10px] ${m.primary ? "opacity-70" : "text-muted-2"}`}>{m.tag}</span>
          </Link>
        ))}
        <Link
          href="/recommendations"
          className="mono flex items-center rounded-2xl border border-dashed border-border-strong px-6 py-4 text-[12px] tracking-[0.1em] text-muted-foreground transition-colors hover:border-foreground hover:text-foreground"
        >
          SURPRISE ME ↗
        </Link>
      </div>
    </section>
  );
}
