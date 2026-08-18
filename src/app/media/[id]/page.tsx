import { notFound } from "next/navigation";
import { getMediaById } from "@/lib/anilist/media";
import { relatedByType } from "@/lib/anilist/relations";
import { ListEditor } from "@/components/ListEditor";
import { MediaCard } from "@/components/MediaCard";
import { StarIcon } from "@/components/icons";

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
      <p className="rounded-2xl border border-dashed border-border py-12 text-center text-sm text-muted-foreground">
        Couldn&apos;t load this title right now. Please try again later.
      </p>
    );
  }
  if (!media) notFound();

  const sequels = relatedByType(media, "SEQUEL");
  const description = (media.description ?? "").replace(/<[^>]+>/g, "");
  const meta = [
    media.format,
    media.seasonYear,
    media.episodes ? `${media.episodes} eps` : null,
    media.chapters ? `${media.chapters} ch` : null,
  ].filter(Boolean);

  return (
    <article className="reveal space-y-10">
      {/* Cinematic banner backdrop */}
      <div className="relative -mx-4 -mt-8 sm:-mx-6">
        <div className="relative h-48 w-full overflow-hidden sm:h-64 md:h-72">
          {media.bannerImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={media.bannerImage}
              alt=""
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="h-full w-full bg-gradient-to-br from-primary/25 to-accent/25" />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-background via-background/70 to-background/20" />
        </div>

        {/* Cover + headline overlapping the banner */}
        <div className="mx-auto -mt-24 max-w-6xl px-4 sm:-mt-28 sm:px-6">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-end">
            <div className="w-36 shrink-0 sm:w-44">
              {media.coverImage ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={media.coverImage}
                  alt={media.title}
                  className="aspect-[2/3] w-full rounded-2xl border border-border-strong object-cover shadow-2xl"
                />
              ) : null}
            </div>
            <div className="space-y-3 pb-1">
              <h1 className="font-display text-3xl font-extrabold leading-tight tracking-tight sm:text-4xl">
                {media.title}
              </h1>
              <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                {media.averageScore ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-2.5 py-1 font-medium text-foreground">
                    <StarIcon size={14} filled className="text-star" /> {media.averageScore}
                  </span>
                ) : null}
                {meta.map((m) => (
                  <span
                    key={String(m)}
                    className="rounded-full border border-border bg-surface px-2.5 py-1"
                  >
                    {m}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Genres */}
      {media.genres.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {media.genres.map((g) => (
            <span
              key={g}
              className="rounded-full border border-border bg-surface/60 px-3 py-1 text-xs font-medium text-muted-foreground"
            >
              {g}
            </span>
          ))}
        </div>
      ) : null}

      {/* List editor card */}
      <div className="rounded-2xl border border-border bg-surface/60 p-5">
        <ListEditor mediaId={media.id} />
      </div>

      {/* Synopsis */}
      {description ? (
        <section className="space-y-3">
          <h2 className="font-display text-lg font-bold tracking-tight">Synopsis</h2>
          <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">
            {description}
          </p>
        </section>
      ) : null}

      {/* Sequels */}
      {sequels.length > 0 ? (
        <section className="space-y-4">
          <div className="flex items-center gap-3">
            <span className="h-5 w-1.5 rounded-full bg-gradient-to-b from-primary to-accent" />
            <h2 className="font-display text-lg font-bold tracking-tight">Sequels</h2>
          </div>
          <div className="stagger grid grid-cols-3 gap-3 sm:grid-cols-4 sm:gap-4 md:grid-cols-6">
            {sequels.map((s) => (
              <MediaCard
                key={s.id}
                media={{ id: s.id, title: s.title, coverImage: s.coverImage, format: s.format }}
              />
            ))}
          </div>
        </section>
      ) : null}
    </article>
  );
}
