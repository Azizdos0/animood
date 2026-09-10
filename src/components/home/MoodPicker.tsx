import Link from "next/link";
import { MoodChoices } from "@/components/discovery/MoodChoices";

export function MoodPicker() {
  return (
    <section className="mx-auto max-w-[1560px] px-6 py-16 sm:px-10">
      <div className="mb-6 flex flex-wrap items-baseline justify-between gap-4">
        <div><h2 className="text-[clamp(26px,3.4vw,34px)] font-black tracking-[-0.035em]">What do you want to feel?</h2>
          <p className="mt-2 text-sm text-muted-foreground">Pick a mood. Find a story that fits you.</p></div>
        <Link href="/recommendations" className="mono text-[11px] tracking-wider text-pink hover:underline">EXPLORE YOUR TASTE ↗</Link>
      </div>
      <MoodChoices />
    </section>
  );
}
