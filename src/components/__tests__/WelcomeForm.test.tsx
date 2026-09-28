import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";

const push = vi.fn();
let searchParams = new URLSearchParams("");
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, replace: push }), useSearchParams: () => searchParams }));
const createProfile = vi.fn(async (..._args: unknown[]) => ({ ok: false, error: "taken" }));
vi.mock("@/lib/profile/queries", () => ({ createProfile: (...a: unknown[]) => createProfile(...a) }));
let authUserId: string | null = "u1";
vi.mock("@/lib/supabase/client", () => ({
  isSupabaseConfigured: () => true,
  supabaseBrowser: () => ({ auth: { getUser: async () => ({ data: { user: authUserId ? { id: authUserId } : null } }) } }),
}));
const signIn = vi.fn();
let authState = {
  user: { email: "a@b.c", avatarUrl: null } as { email: string; avatarUrl: null } | null,
  configured: true, signIn, username: null, refreshProfile: async () => {},
};
vi.mock("@/components/SyncProvider", () => ({
  useAuth: () => authState,
}));

import { WelcomeForm } from "@/components/WelcomeForm";

describe("WelcomeForm", () => {
  it("shows a validation error for an invalid username without submitting", async () => {
    render(<WelcomeForm />);
    await userEvent.type(screen.getByLabelText(/username/i), "ab");
    await userEvent.click(screen.getByRole("button", { name: /claim/i }));
    expect(screen.getByText(/at least 3/i)).toBeInTheDocument();
    expect(createProfile).not.toHaveBeenCalled();
  });
  it("surfaces a 'taken' error from the server", async () => {
    render(<WelcomeForm />);
    await userEvent.type(screen.getByLabelText(/username/i), "aziz");
    await userEvent.click(screen.getByRole("button", { name: /claim/i }));
    expect(await screen.findByText(/already taken/i)).toBeInTheDocument();
  });

  it("guards an unsafe 'next' redirect param and falls back to /", async () => {
    searchParams = new URLSearchParams({ next: "//evil.com" });
    createProfile.mockResolvedValueOnce({
      ok: true,
      profile: { userId: "u1", username: "aziz", displayName: null, avatarUrl: null, isPublic: true, createdAt: "2026-01-01T00:00:00.000Z" },
    } as never);
    push.mockClear();
    render(<WelcomeForm />);
    await userEvent.type(screen.getByLabelText(/username/i), "aziz");
    await userEvent.click(screen.getByRole("button", { name: /claim/i }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/"));
    searchParams = new URLSearchParams("");
  });

  it("asks a signed-out visitor to sign in instead of showing the form", async () => {
    authState = { ...authState, user: null };
    render(<WelcomeForm />);
    expect(screen.queryByLabelText(/username/i)).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: /sign in with google/i }));
    expect(signIn).toHaveBeenCalledOnce();
    authState = { ...authState, user: { email: "a@b.c", avatarUrl: null } };
  });

  it("does not try to create a profile when the session has ended", async () => {
    authUserId = null;
    createProfile.mockClear();
    render(<WelcomeForm />);
    await userEvent.type(screen.getByLabelText(/username/i), "aziz");
    await userEvent.click(screen.getByRole("button", { name: /claim/i }));
    expect(await screen.findByText(/session has ended/i)).toBeInTheDocument();
    expect(createProfile).not.toHaveBeenCalled();
    authUserId = "u1";
  });
});
