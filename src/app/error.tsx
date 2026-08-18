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
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border py-20 text-center">
      <p className="font-display text-lg font-bold">Something went wrong.</p>
      <p className="mt-1 text-sm text-muted-foreground">Please try again.</p>
      <button
        type="button"
        onClick={() => reset()}
        className="mt-5 rounded-xl bg-gradient-to-r from-primary-strong to-accent px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-primary/25 transition-transform hover:scale-[1.03]"
      >
        Try again
      </button>
    </div>
  );
}
