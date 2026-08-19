import Link from "next/link";
import type { Route } from "next";

/** "01 / TRENDING ANIME" mono kicker + big Archivo headline, with an optional action link. */
export function SectionHead({
  kicker,
  title,
  accent = "violet",
  action,
  href,
}: {
  kicker: string;
  title: string;
  accent?: "pink" | "violet";
  action?: string;
  href?: Route;
}) {
  return (
    <div className="mb-6 flex items-end justify-between gap-5">
      <div>
        <div className={`mono text-[11px] tracking-[0.16em] ${accent === "pink" ? "text-pink" : "text-violet"}`}>
          {kicker}
        </div>
        <h2 className="mt-2.5 text-[clamp(26px,3.4vw,34px)] font-black leading-none tracking-[-0.035em]">
          {title}
        </h2>
      </div>
      {action && href ? (
        <Link
          href={href}
          className="mono shrink-0 border-b border-border-strong pb-1 text-[12px] tracking-[0.1em] text-muted-foreground transition-colors hover:text-foreground"
        >
          {action}
        </Link>
      ) : null}
    </div>
  );
}

/** Page header: mono kicker + huge headline (Search / For You / My List / Stats). */
export function PageHead({
  kicker,
  accent = "violet",
  children,
}: {
  kicker: string;
  accent?: "pink" | "violet";
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className={`mono text-[11px] tracking-[0.16em] ${accent === "pink" ? "text-pink" : "text-violet"}`}>
        {kicker}
      </div>
      <h1 className="mt-3.5 text-[clamp(40px,5vw,72px)] font-black leading-[0.9] tracking-[-0.045em]">
        {children}
      </h1>
    </div>
  );
}
