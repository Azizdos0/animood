"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createCommunity } from "@/lib/communities/queries";
import { validateSlug, type SlugError } from "@/lib/communities/slug";
import { isSupabaseConfigured, supabaseBrowser } from "@/lib/supabase/client";

type Status = "checking" | "signedOut" | "ready" | "unconfigured";

const SLUG_ERROR_COPY: Record<SlugError, string> = {
  too_short: "Must be at least 3 characters.",
  too_long: "Must be 30 characters or fewer.",
  invalid_chars: "Only lowercase letters, numbers, - and _ are allowed.",
  reserved: "That URL is reserved.",
};

const SUBMIT_ERROR_COPY: Record<"slug_taken" | "invalid" | "unknown", string> = {
  slug_taken: "That URL is taken.",
  invalid: "Check the name and description.",
  unknown: "Something went wrong.",
};

const fieldClass =
  "w-full rounded-2xl border border-border bg-surface/40 px-4 py-3 text-sm outline-none transition-colors focus:border-border-strong";

export function CreateCommunityForm() {
  const router = useRouter();
  const [status, setStatus] = useState<Status>("checking");
  const [slug, setSlug] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [pending, setPending] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (!isSupabaseConfigured()) {
      setStatus("unconfigured");
      return;
    }
    let cancelled = false;
    supabaseBrowser()
      .auth.getUser()
      .then(({ data }) => {
        if (cancelled) return;
        setStatus(data.user ? "ready" : "signedOut");
      })
      .catch(() => {
        if (cancelled) return;
        setStatus("signedOut");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const trimmedSlug = slug.trim();
  const slugResult = trimmedSlug === "" ? null : validateSlug(trimmedSlug);
  const slugError = slugResult && !slugResult.ok ? SLUG_ERROR_COPY[slugResult.error] : null;
  const canSubmit = !!slugResult?.ok && name.trim() !== "" && !pending;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!slugResult?.ok || name.trim() === "" || pending) return;
    setPending(true);
    setSubmitError(null);
    try {
      const result = await createCommunity(supabaseBrowser(), slugResult.value, name.trim(), description.trim());
      if (result.ok) {
        router.push(`/communities/${slugResult.value}`);
      } else {
        setSubmitError(SUBMIT_ERROR_COPY[result.error] ?? SUBMIT_ERROR_COPY.unknown);
      }
    } catch {
      setSubmitError(SUBMIT_ERROR_COPY.unknown);
    } finally {
      setPending(false);
    }
  }

  if (status === "unconfigured") {
    return <p className="text-sm text-muted-foreground">Communities are unavailable.</p>;
  }

  if (status === "checking") {
    return <div className="skeleton h-40 w-full rounded-2xl" />;
  }

  if (status === "signedOut") {
    return <p className="text-sm text-muted-foreground">Sign in to create a community.</p>;
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-1.5">
        <label htmlFor="community-slug" className="mono text-[11px] tracking-[0.1em] text-muted-foreground">
          URL slug
        </label>
        <input
          id="community-slug"
          type="text"
          value={slug}
          onChange={(e) => setSlug(e.target.value)}
          placeholder="isekai-fans"
          aria-label="URL slug"
          className={fieldClass}
        />
        {slugError ? <p className="text-[12px] text-pink">{slugError}</p> : null}
      </div>

      <div className="space-y-1.5">
        <label htmlFor="community-name" className="mono text-[11px] tracking-[0.1em] text-muted-foreground">
          Name
        </label>
        <input
          id="community-name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Isekai Fans"
          aria-label="Name"
          maxLength={100}
          className={fieldClass}
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="community-description" className="mono text-[11px] tracking-[0.1em] text-muted-foreground">
          Description
        </label>
        <textarea
          id="community-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="What is this community about?"
          rows={3}
          aria-label="Description"
          maxLength={500}
          className={fieldClass}
        />
      </div>

      <div className="flex items-center justify-between gap-2">
        {submitError ? <span className="text-[12px] text-pink">{submitError}</span> : <span />}
        <button
          type="submit"
          disabled={!canSubmit}
          className="rounded-full bg-foreground px-5 py-2.5 text-[12px] font-extrabold text-background transition-colors hover:bg-pink disabled:opacity-40"
        >
          Create community
        </button>
      </div>
    </form>
  );
}
