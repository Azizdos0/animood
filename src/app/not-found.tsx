import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border py-20 text-center">
      <p className="font-display text-5xl font-extrabold tracking-tight">404</p>
      <p className="mt-2 text-sm text-muted-foreground">
        We couldn&apos;t find that page.
      </p>
      <Link
        href="/"
        className="mt-5 rounded-xl bg-gradient-to-r from-primary-strong to-accent px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-primary/25 transition-transform hover:scale-[1.03]"
      >
        Back to home
      </Link>
    </div>
  );
}
