import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";

const createCommunity = vi.fn(async (..._a: unknown[]): Promise<{ ok: true; id: string } | { ok: false; error: string }> => ({ ok: true, id: "c1" }));
vi.mock("@/lib/communities/queries", () => ({
  createCommunity: (...a: unknown[]) => createCommunity(...a),
}));

let user: { id: string } | null = { id: "viewer" };
vi.mock("@/lib/supabase/client", () => ({
  isSupabaseConfigured: () => true,
  supabaseBrowser: () => ({ auth: { getUser: async () => ({ data: { user } }) } }),
}));

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

import { CreateCommunityForm } from "@/components/communities/CreateCommunityForm";

beforeEach(() => {
  createCommunity.mockClear();
  createCommunity.mockResolvedValue({ ok: true, id: "c1" });
  push.mockClear();
  user = { id: "viewer" };
});

describe("CreateCommunityForm", () => {
  it("shows a validation error for a too-short slug and does not submit", async () => {
    render(<CreateCommunityForm />);
    await screen.findByLabelText(/slug/i);
    await userEvent.type(screen.getByLabelText(/slug/i), "ab");
    expect(await screen.findByText(/at least 3 characters/i)).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText(/^name/i), "My Group");
    await userEvent.click(screen.getByRole("button", { name: /create/i }));

    expect(createCommunity).not.toHaveBeenCalled();
  });

  it("submits a valid slug/name and routes to the new community", async () => {
    render(<CreateCommunityForm />);
    await screen.findByLabelText(/slug/i);
    await userEvent.type(screen.getByLabelText(/slug/i), "isekai-fans");
    await userEvent.type(screen.getByLabelText(/^name/i), "Isekai Fans");
    await userEvent.type(screen.getByLabelText(/description/i), "For fans of isekai.");
    await userEvent.click(screen.getByRole("button", { name: /create/i }));

    await waitFor(() =>
      expect(createCommunity).toHaveBeenCalledWith(expect.anything(), "isekai-fans", "Isekai Fans", "For fans of isekai."),
    );
    await waitFor(() => expect(push).toHaveBeenCalledWith("/communities/isekai-fans"));
  });

  it("shows a taken-slug error from the server", async () => {
    createCommunity.mockResolvedValue({ ok: false, error: "slug_taken" });
    render(<CreateCommunityForm />);
    await screen.findByLabelText(/slug/i);
    await userEvent.type(screen.getByLabelText(/slug/i), "isekai-fans");
    await userEvent.type(screen.getByLabelText(/^name/i), "Isekai Fans");
    await userEvent.click(screen.getByRole("button", { name: /create/i }));

    expect(await screen.findByText(/that url is taken/i)).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });
});
