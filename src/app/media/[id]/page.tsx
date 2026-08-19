import { notFound } from "next/navigation";
import { getMediaById } from "@/lib/anilist/media";
import { relatedByType } from "@/lib/anilist/relations";
import { ListEditor } from "@/components/ListEditor";
import { MediaCard } from "@/components/MediaCard";
import { SectionHead } from "@/components/editorial";

export default async function MediaDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const mediaId = Number(id);
  if (!Number.isInteger(mediaId)) notFound();

  let media;
  try {
    media = await getMediaById(mediaId);
  } catch {
    return (
      <p className="mono mx-auto max-w-[1560px] rounded-2xl border border-dashed border-border px-6 py-14 text-center text-xs tracking-[0.14em] text-muted-2">
        COULDN&apos;T LOAD THIS TITLE — TRY AGAIN LATER
      </p>
    );
  }
  if (!media) notFound();

  const sequels = relatedByType(media, "SEQUEL");
  const description = (media.description ?? "").replace(/<[^>]+>/g, "");
  const metaLine = [
    media.format,
    media.seasonYear,
    media.episodes ? `${media.episodes} EP` : null,
    media.chapters ? `${media.chapters} CH` : null,
  ].filter(Boolean).join(" · ");
  const score = media.averageScore ? (media.averageScore / 20).toFixed(1) : null;

  return (
    <article className="reveal">
      {/* Banner */}
      <div className="relative border-b border-border">
        <div className="relative h-[220px] w-full stripe-fill sm:h-[300px]">
          {media.bannerImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={media.bannerImage} alt="" className="h-full w-full object-cover" />
          ) : null}
          <div className="absolute inset-0" style={{ background: "linear-gradient(180deg, rgba(10,10,13,0.2), var(--background))" }} />
        </div>

        <div className="mx-auto -mt-24 grid max-w-[1560px] items-end gap-9 px-6 sm:-mt-28 sm:px-10 md:grid-cols-[230px_minmax(0,1fr)]">
          <div className="w-40 md:w-full">
            {media.coverImage ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={media.coverImage}
                alt={media.title}
                className="aspect-[2/3] w-full rounded-2xl border border-border-strong object-cover shadow-2xl"
              />
            ) : null}
          </div>
          <div className="pb-1.5">
            <div className="mono flex items-center gap-2.5 text-[11px] tracking-[0.12em] text-pink">
              <span className="text-muted-2">{metaLine}</span>
            </div>
            <h1 className="mt-3.5 text-[clamp(34px,5vw,68px)] font-black leading-[0.92] tracking-[-0.045em]">
              {media.title}
            </h1>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              {score ? (
                <span className="mono rounded-full bg-violet px-3.5 py-1.5 text-[10px] tracking-[0.1em] text-on-accent">★ {score}</span>
              ) : null}
              {media.genres.slice(0, 4).map((g) => (
                <span key={g} className="mono rounded-full border border-border-strong px-3.5 py-1.5 text-[10px] tracking-[0.1em] text-muted-foreground">
                  {g.toUpperCase()}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-[1560px] space-y-12 px-6 py-11 sm:px-10">
        {/* List editor */}
        <div className="rounded-2xl border border-border bg-surface p-5 sm:p-6">
          <ListEditor mediaId={media.id} />
        </div>

        {/* Synopsis */}
        {description ? (
          <section>
            <div className="mono mb-4 text-[11px] tracking-[0.16em] text-violet">SYNOPSIS</div>
            <p className="max-w-3xl text-[17px] leading-relaxed text-muted-foreground">{description}</p>
          </section>
        ) : null}

        {/* Sequels */}
        {sequels.length > 0 ? (
          <section>
            <SectionHead kicker="RELATED · SEQUELS" title="Keep going" accent="pink" />
            <div className="stagger grid grid-cols-3 gap-4 sm:grid-cols-4 md:grid-cols-6">
              {sequels.map((s) => (
                <MediaCard key={s.id} media={{ id: s.id, title: s.title, coverImage: s.coverImage, format: s.format }} />
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </article>
  );
}
