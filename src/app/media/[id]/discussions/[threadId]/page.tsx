import Link from "next/link";
import { notFound } from "next/navigation";
import { getMediaById } from "@/lib/anilist/media";
import { loadThread } from "@/lib/discussions/server";
import { ThreadView } from "@/components/discussions/ThreadView";
import { ThreadDeleteButton } from "@/components/discussions/ThreadDeleteButton";

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const diffMs = Date.now() - then;
  const diffSec = Math.round(diffMs / 1000);
  const abs = Math.abs(diffSec);
  if (abs < 60) return "just now";
  const diffMin = Math.round(diffSec / 60);
  if (Math.abs(diffMin) < 60) return `${Math.abs(diffMin)}m ago`;
  const diffHr = Math.round(diffMin / 60);
  if (Math.abs(diffHr) < 24) return `${Math.abs(diffHr)}h ago`;
  const diffDay = Math.round(diffHr / 24);
  if (Math.abs(diffDay) < 30) return `${Math.abs(diffDay)}d ago`;
  const diffMonth = Math.round(diffDay / 30);
  if (Math.abs(diffMonth) < 12) return `${Math.abs(diffMonth)}mo ago`;
  const diffYear = Math.round(diffMonth / 12);
  return `${Math.abs(diffYear)}y ago`;
}

export default async function ThreadPage({
  params,
}: {
  params: Promise<{ id: string; threadId: string }>;
}) {
  const { id, threadId } = await params;
  const mediaId = Number(id);
  if (!Number.isInteger(mediaId)) notFound();

  let title = "this title";
  try {
    const media = await getMediaById(mediaId);
    if (media?.title) title = media.title;
  } catch {
    // best-effort: keep the generic fallback label
  }

  const res = await loadThread(mediaId, threadId).catch(() => ({ state: "not_found" as const }));
  if (res.state === "not_found") notFound();

  const { thread, posts } = res;

  return (
    <div className="mx-auto max-w-[1560px] px-6 py-12 sm:px-10">
      <Link
        href={`/media/${mediaId}`}
        className="mono mb-6 inline-block text-[11px] tracking-[0.12em] text-muted-foreground hover:text-foreground"
      >
        ← Discussions for {title}
      </Link>

      <div className="rounded-2xl border border-border bg-surface/40 p-5 sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <h1 className="text-[22px] font-black tracking-[-0.02em]">{thread.title}</h1>
          <ThreadDeleteButton threadId={threadId} mediaId={mediaId} authorId={thread.userId} />
        </div>
        <div className="mono mt-1.5 text-[12px] text-muted-2">
          @{thread.username} · {relativeTime(thread.createdAt)}
        </div>
        {thread.body ? (
          <p className="mt-3 whitespace-pre-wrap text-sm text-muted-foreground">{thread.body}</p>
        ) : null}
      </div>

      <div className="mt-8">
        <ThreadView threadId={threadId} initialPosts={posts} />
      </div>
    </div>
  );
}
