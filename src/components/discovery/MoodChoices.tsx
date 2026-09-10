import Link from "next/link";
import { MOODS, discoveryHref, type MoodId } from "@/lib/recommend/moods";
import type { MediaType } from "@/lib/anilist/types";

export function MoodChoices({ selected = null, type = "ANIME" }: { selected?: MoodId | null; type?: MediaType }) {
  return (
    <nav aria-label="Choose your mood" className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
      {MOODS.map((mood) => (
        <Link key={mood.id} href={discoveryHref(mood.id, type)} aria-current={selected === mood.id ? "page" : undefined}
          className={`group flex min-h-40 flex-col rounded-2xl border p-5 transition-colors focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-pink ${selected === mood.id ? "border-pink bg-pink text-on-accent" : "border-border-strong bg-surface hover:border-pink hover:bg-pink/10"}`}>
          <span aria-hidden="true" className={`mb-5 text-3xl leading-none ${selected === mood.id ? "" : "text-pink"}`}>{mood.symbol}</span>
          <span className="text-base font-extrabold tracking-tight">{mood.label}</span>
          <span className={`mt-1 text-xs leading-relaxed ${selected === mood.id ? "opacity-80" : "text-muted-foreground"}`}>{mood.note}</span>
        </Link>
      ))}
    </nav>
  );
}
