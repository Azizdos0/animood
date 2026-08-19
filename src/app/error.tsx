"use client";

import { useEffect } from "react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto flex max-w-[1560px] flex-col items-center justify-center px-6 py-28 text-center sm:px-10">
      <p className="text-2xl font-black tracking-[-0.03em]">Something went wrong.</p>
      <p className="mono mt-2 text-xs tracking-[0.14em] text-muted-2">PLEASE TRY AGAIN</p>
      <button
        type="button"
        onClick={() => reset()}
        className="mt-6 rounded-full bg-foreground px-6 py-2.5 text-sm font-extrabold text-background transition-colors hover:bg-pink"
      >
        Try again
      </button>
    </div>
  );
}
