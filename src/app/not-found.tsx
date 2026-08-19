import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto flex max-w-[1560px] flex-col items-center justify-center px-6 py-28 text-center sm:px-10">
      <p className="text-[clamp(64px,12vw,140px)] font-black leading-none tracking-[-0.05em]">404</p>
      <p className="mono mt-3 text-xs tracking-[0.14em] text-muted-2">WE COULDN&apos;T FIND THAT PAGE</p>
      <Link
        href="/"
        className="mt-6 rounded-full bg-foreground px-6 py-2.5 text-sm font-extrabold text-background transition-colors hover:bg-pink"
      >
        Back to home
      </Link>
    </div>
  );
}
