import Link from "next/link";
import { getTrending } from "@/lib/anilist/media";
import type { Media } from "@/lib/anilist/types";
import { MediaCard } from "@/components/MediaCard";
import { SectionHead } from "@/components/editorial";
import { Ticker } from "@/components/home/Ticker";
import { MoodPicker } from "@/components/home/MoodPicker";
import { HeroStats } from "@/components/home/HeroStats";
import { InProgress } from "@/components/home/InProgress";
import { CompactCard } from "@/components/home/CompactCard";

function Hero({ anime }: { anime: Media[] }) {
  const key = anime[0];
  const cover = anime[1];
  return (
    <section className="relative border-b border-border px-6 pb-14 pt-16 sm:px-10 sm:pt-[76px]">
      <div className="pointer-events-none absolute inset-0" style={{
        background:
          "radial-gradient(760px 420px at 84% 8%, var(--glow-violet), transparent 70%)," +
          "radial-gradient(620px 380px at 6% 92%, var(--glow-pink), transparent 70%)",
      }} />
      <div className="relative mx-auto grid max-w-[1560px] items-end gap-12 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
        <div>
          <div className="mono mb-6 flex items-center gap-2.5 text-[11px] tracking-[0.18em] text-pink">
            <span className="h-px w-6 bg-pink" />
            <span>TRACK · DISCOVER · OBSESS</span>
          </div>
          <h1 className="text-[clamp(48px,7.2vw,116px)] font-black leading-[0.88] tracking-[-0.045em]">
            Your anime &amp; manga,<br />
            <span className="text-foreground/35">beautifully</span>{" "}
            <span className="bg-gradient-to-r from-pink to-violet bg-clip-text italic text-transparent">tracked.</span>
          </h1>
          <p className="mt-7 max-w-[520px] text-[17px] leading-relaxed text-muted-foreground">
            Thousands of titles, one list that follows your taste. Pick a mood and Animood pulls the
            shows that match it — not the ones an algorithm wants to sell you.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/search" className="rounded-full bg-foreground px-7 py-3.5 text-[14px] font-extrabold text-background transition-colors hover:bg-pink">
              Explore titles
            </Link>
            <Link href="/my-list" className="rounded-full border border-border-strong px-7 py-3.5 text-[14px] font-bold transition-colors hover:border-foreground">
              My list
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3.5">
          <div className="col-span-2 aspect-[16/11] overflow-hidden rounded-2xl border border-border stripe-fill">
            {key?.bannerImage || key?.coverImage ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={key.bannerImage ?? key.coverImage!} alt={key.title} className="h-full w-full object-cover" />
            ) : null}
          </div>
          <div className="aspect-[2/3] overflow-hidden rounded-2xl border border-border stripe-fill">
            {cover?.coverImage ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={cover.coverImage} alt={cover.title} className="h-full w-full object-cover" />
            ) : null}
          </div>
          <HeroStats />
        </div>
      </div>
    </section>
  );
}

export default async function HomePage() {
  let anime: Media[] = [];
  let manga: Media[] = [];
  let failed = false;
  try {
    [anime, manga] = await Promise.all([getTrending("ANIME", 12), getTrending("MANGA", 12)]);
  } catch {
    failed = true;
  }

  if (failed) {
    return (
      <div className="mx-auto max-w-[1560px] px-6 py-24 text-center sm:px-10">
        <p className="mono text-xs tracking-[0.14em] text-muted-2">
          COULDN&apos;T LOAD TRENDING TITLES — TRY AGAIN LATER
        </p>
      </div>
    );
  }

  const ticker = [
    ...anime.slice(0, 3).map((m) => `TRENDING · ${m.title.toUpperCase()}`),
    ...manga.slice(0, 3).map((m) => `ON THE PAGE · ${m.title.toUpperCase()}`),
  ];

  return (
    <>
      <Hero anime={anime} />
      <Ticker items={ticker} />
      <MoodPicker />

      <section className="mx-auto max-w-[1560px] px-6 pb-16 sm:px-10">
        <SectionHead kicker="01 / TRENDING ANIME" title="Everyone's watching" accent="violet" action="SEARCH ALL →" href="/search?type=ANIME" />
        <div className="stagger grid grid-cols-3 gap-4 sm:grid-cols-4 md:grid-cols-6">
          {anime.slice(0, 12).map((m, i) => (
            <MediaCard key={m.id} media={{ id: m.id, title: m.title, coverImage: m.coverImage, format: m.format }} rank={i + 1} />
          ))}
        </div>
      </section>

      <InProgress />

      <section className="mx-auto max-w-[1560px] px-6 pb-20 sm:px-10">
        <SectionHead kicker="03 / TRENDING MANGA" title="On the page" accent="pink" action="SEARCH ALL →" href="/search?type=MANGA" />
        <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
          {manga.slice(0, 9).map((m) => (
            <CompactCard key={m.id} media={m} />
          ))}
        </div>
      </section>
    </>
  );
}
