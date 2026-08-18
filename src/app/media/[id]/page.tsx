import { notFound } from "next/navigation";
import { getMediaById } from "@/lib/anilist/media";
import { relatedByType } from "@/lib/anilist/relations";
import { ListEditor } from "@/components/ListEditor";
import { MediaCard } from "@/components/MediaCard";

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
      <p className="py-12 text-center text-sm opacity-70">
        Couldn&apos;t load this title right now. Please try again later.
      </p>
    );
  }
  if (!media) notFound();

  const sequels = relatedByType(media, "SEQUEL");
  const description = (media.description ?? "").replace(/<[^>]+>/g, "");

  return (
    <article className="space-y-8">
      <div className="flex flex-col gap-6 sm:flex-row">
        {media.coverImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={media.coverImage}
            alt={media.title}
            className="w-40 shrink-0 self-start rounded-lg object-cover"
          />
        ) : null}
        <div className="space-y-3">
          <h1 className="text-2xl font-bold">{media.title}</h1>
          <p className="text-sm opacity-70">
            {[media.format, media.seasonYear, media.episodes ? `${media.episodes} eps` : null,
              media.chapters ? `${media.chapters} ch` : null,
              media.averageScore ? `★ ${media.averageScore}` : null]
              .filter(Boolean).join(" · ")}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {media.genres.map((g) => (
              <span key={g} className="rounded-full bg-black/10 px-2 py-0.5 text-xs dark:bg-white/10">
                {g}
              </span>
            ))}
          </div>
          <ListEditor mediaId={media.id} />
        </div>
      </div>

      {description ? <p className="max-w-3xl text-sm leading-relaxed">{description}</p> : null}

      {sequels.length > 0 ? (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Sequels</h2>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 md:grid-cols-6">
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
