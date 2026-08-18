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
    <div className="py-16 text-center">
      <p className="text-sm opacity-70">
        Something went wrong. Please try again later.
      </p>
      <button
        type="button"
        onClick={() => reset()}
        className="mt-4 rounded-full bg-black/10 px-4 py-1.5 text-sm font-medium hover:bg-black/20 dark:bg-white/10 dark:hover:bg-white/20"
      >
        Try again
      </button>
    </div>
  );
}
