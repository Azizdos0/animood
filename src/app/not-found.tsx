import Link from "next/link";

export default function NotFound() {
  return (
    <div className="py-16 text-center">
      <p className="text-sm opacity-70">We couldn&apos;t find that page.</p>
      <Link
        href="/"
        className="mt-4 inline-block rounded-full bg-black/10 px-4 py-1.5 text-sm font-medium hover:bg-black/20 dark:bg-white/10 dark:hover:bg-white/20"
      >
        Back to home
      </Link>
    </div>
  );
}
