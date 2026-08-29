"use client";

import { useEffect, useState } from "react";
import { searchUsers } from "@/lib/discover/queries";
import { isSupabaseConfigured, supabaseBrowser } from "@/lib/supabase/client";
import { UserCard } from "@/components/discover/UserCard";
import type { UserResult } from "@/lib/discover/types";

const DEBOUNCE_MS = 300;
const MIN_QUERY_LENGTH = 2;

function ResultsSkeleton() {
  return (
    <div className="space-y-3" aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-[72px] animate-pulse rounded-2xl border border-border bg-surface/40" />
      ))}
    </div>
  );
}

export function UserSearch() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<UserResult[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const configured = isSupabaseConfigured();

  useEffect(() => {
    if (!configured) return;
    const trimmed = query.trim();
    if (trimmed.length < MIN_QUERY_LENGTH) {
      setResults(null);
      setLoading(false);
      setError(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    const timer = setTimeout(() => {
      searchUsers(supabaseBrowser(), trimmed)
        .then((res) => {
          if (cancelled) return;
          setResults(res);
          setLoading(false);
        })
        .catch(() => {
          if (cancelled) return;
          setError("Something went wrong. Try again.");
          setLoading(false);
        });
    }, DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, configured]);

  if (!configured) {
    return <p className="text-sm text-muted-foreground">User search is unavailable.</p>;
  }

  const trimmed = query.trim();
  const idle = trimmed.length < MIN_QUERY_LENGTH;

  return (
    <div className="space-y-6">
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        aria-label="Search users"
        placeholder="Search by username..."
        className="w-full rounded-2xl border border-border bg-surface/40 px-4 py-3 text-sm outline-none transition-colors focus:border-border-strong"
      />

      {idle ? (
        <p className="text-sm text-muted-foreground">Search for people by username.</p>
      ) : loading ? (
        <ResultsSkeleton />
      ) : error ? (
        <p className="text-sm text-muted-foreground">{error}</p>
      ) : results && results.length > 0 ? (
        <div className="space-y-3">
          {results.map((user) => (
            <UserCard key={user.username} user={user} />
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">No users found.</p>
      )}
    </div>
  );
}
