import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, replace: push }), useSearchParams: () => new URLSearchParams("") }));
const createProfile = vi.fn(async (..._args: unknown[]) => ({ ok: false, error: "taken" }));
vi.mock("@/lib/profile/queries", () => ({ createProfile: (...a: unknown[]) => createProfile(...a) }));
vi.mock("@/lib/supabase/client", () => ({ isSupabaseConfigured: () => true, supabaseBrowser: () => ({}) }));
vi.mock("@/components/SyncProvider", () => ({
  useAuth: () => ({ user: { email: "a@b.c", avatarUrl: null }, username: null, refreshProfile: async () => {} }),
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
});
