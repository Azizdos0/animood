import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

const joinCommunity = vi.fn(async (..._a: unknown[]): Promise<{ ok: true } | { ok: false; error: string }> => ({ ok: true }));
const leaveCommunity = vi.fn(async (..._a: unknown[]) => ({ ok: true as const }));
vi.mock("@/lib/communities/queries", () => ({
  joinCommunity: (...a: unknown[]) => joinCommunity(...a),
  leaveCommunity: (...a: unknown[]) => leaveCommunity(...a),
}));
vi.mock("@/lib/supabase/client", () => ({
  isSupabaseConfigured: () => true,
  supabaseBrowser: () => ({ auth: { getUser: async () => ({ data: { user: { id: "u1" } } }) } }),
}));
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh }) }));

import { CommunityHeader } from "@/components/communities/CommunityHeader";
import type { Community } from "@/lib/communities/types";

const community: Community = {
  id: "c1", slug: "isekai-fans", name: "Isekai Fans", description: "For fans",
  memberCount: 12, createdBy: "u0", createdAt: "2026-01-01T00:00:00Z",
};

beforeEach(() => {
  joinCommunity.mockClear();
  leaveCommunity.mockClear();
  refresh.mockClear();
});

describe("CommunityHeader", () => {
  it("shows an inline error and does not refresh when join fails as banned", async () => {
    joinCommunity.mockResolvedValueOnce({ ok: false, error: "banned" });
    render(<CommunityHeader community={community} viewerRole={null} />);
    const button = await screen.findByRole("button", { name: /join/i });
    await waitFor(() => expect(button).not.toBeDisabled());
    button.click();
    await waitFor(() => expect(joinCommunity).toHaveBeenCalledWith(expect.anything(), "c1"));
    expect(await screen.findByText(/can't join this community/i)).toBeInTheDocument();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("refreshes and shows no error when join succeeds", async () => {
    render(<CommunityHeader community={community} viewerRole={null} />);
    const button = await screen.findByRole("button", { name: /join/i });
    await waitFor(() => expect(button).not.toBeDisabled());
    button.click();
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(screen.queryByText(/can't join this community/i)).toBeNull();
  });
});
