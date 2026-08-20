"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/components/SyncProvider";
import { supabaseBrowser } from "@/lib/supabase/client";
import { createProfile } from "@/lib/profile/queries";
import { validateUsername, type UsernameError } from "@/lib/profile/username";

const ERROR_COPY: Record<UsernameError, string> = {
  too_short: "Usernames must be at least 3 characters.",
  too_long: "Usernames must be at most 20 characters.",
  invalid_chars: "Use only lowercase letters, numbers, and underscores.",
  reserved: "That username is reserved.",
};

const safeNext = (n: string | null): string =>
  n && n.startsWith("/") && !n.startsWith("//") ? n : "/";

export function WelcomeForm() {
  const { user, refreshProfile } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next");

  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;

    const check = validateUsername(value);
    if (!check.ok) {
      setError(ERROR_COPY[check.error]);
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const supabase = supabaseBrowser();
      const authResult = await supabase.auth?.getUser?.();
      const userId: string = authResult?.data?.user?.id ?? "";
      const displayName = user?.email ? user.email.split("@")[0] : null;

      const result = await createProfile(supabase, {
        userId,
        username: check.value,
        displayName,
        avatarUrl: user?.avatarUrl ?? null,
      });

      if (!result.ok) {
        if (result.error === "taken") {
          setError("That username is already taken.");
        } else {
          setError("Something went wrong. Please try again.");
        }
        return;
      }

      await refreshProfile();
      router.replace(safeNext(next));
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-[560px] space-y-8">
      <form onSubmit={handleSubmit} className="space-y-5" noValidate>
        <div className="space-y-2">
          <label htmlFor="welcome-username" className="mono block text-[11px] tracking-[0.16em] text-muted-2">
            USERNAME
          </label>
          <input
            id="welcome-username"
            name="username"
            type="text"
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="yourname"
            className="w-full rounded-xl border border-border-strong bg-surface px-4 py-3 text-base font-medium outline-none transition-colors focus:border-foreground"
          />
          {error ? (
            <p role="alert" className="text-sm font-semibold text-pink">
              {error}
            </p>
          ) : null}
        </div>

        <p className="text-sm leading-6 text-muted-foreground">
          Your profile will be public — you can make it private anytime from your profile page.
        </p>

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-full bg-foreground px-5 py-3 text-sm font-extrabold text-background transition-colors hover:bg-pink disabled:cursor-not-allowed disabled:opacity-60"
        >
          {submitting ? "Claiming…" : "Claim username"}
        </button>
      </form>
    </div>
  );
}
