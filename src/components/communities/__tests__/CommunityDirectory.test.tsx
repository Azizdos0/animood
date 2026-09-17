import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

const listCommunities = vi.fn();
vi.mock("@/lib/communities/queries", () => ({
  listCommunities: (...a: unknown[]) => listCommunities(...a),
}));
vi.mock("@/lib/supabase/client", () => ({
  isSupabaseConfigured: () => true,
  supabaseBrowser: () => ({}),
}));

import { CommunityDirectory } from "@/components/communities/CommunityDirectory";
import type { Community } from "@/lib/communities/types";

const community: Community = {
  id: "c1", slug: "isekai-fans", name: "Isekai Fans", description: "For fans",
  memberCount: 12, createdBy: "u0", createdAt: "2026-01-01T00:00:00Z",
};

beforeEach(() => {
  listCommunities.mockReset();
});

describe("CommunityDirectory", () => {
  it("renders communities from listCommunities, linking to each slug with a member count", async () => {
    listCommunities.mockResolvedValue([community]);
    render(<CommunityDirectory />);
    const link = await screen.findByRole("link", { name: /isekai fans/i });
    expect(link).toHaveAttribute("href", "/communities/isekai-fans");
    expect(screen.getByText(/12 members/i)).toBeInTheDocument();
  });

  it("shows an empty state when there are no communities", async () => {
    listCommunities.mockResolvedValue([]);
    render(<CommunityDirectory />);
    expect(await screen.findByText(/no communities yet/i)).toBeInTheDocument();
  });

  it("shows an error state when the query rejects", async () => {
    listCommunities.mockRejectedValue(new Error("boom"));
    render(<CommunityDirectory />);
    expect(await screen.findByText(/couldn.t load communities/i)).toBeInTheDocument();
  });
});
