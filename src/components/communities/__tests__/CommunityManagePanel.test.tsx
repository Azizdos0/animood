import { render, screen, waitFor, fireEvent, within } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

const setMemberRole = vi.fn(async (..._a: unknown[]): Promise<{ ok: true } | { ok: false; error: string }> => ({ ok: true }));
const banMember = vi.fn(async (..._a: unknown[]) => ({ ok: true as const }));
const unbanMember = vi.fn(async (..._a: unknown[]) => ({ ok: true as const }));
const deleteCommunity = vi.fn(async (..._a: unknown[]) => ({ ok: true as const }));
vi.mock("@/lib/communities/queries", () => ({
  setMemberRole: (...a: unknown[]) => setMemberRole(...a),
  banMember: (...a: unknown[]) => banMember(...a),
  unbanMember: (...a: unknown[]) => unbanMember(...a),
  deleteCommunity: (...a: unknown[]) => deleteCommunity(...a),
}));
vi.mock("@/lib/supabase/client", () => ({
  supabaseBrowser: () => ({}),
}));
const push = vi.fn();
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh }) }));

import { CommunityManagePanel } from "@/components/communities/CommunityManagePanel";
import type { BannedMember, Community, CommunityMember } from "@/lib/communities/types";

const community: Community = {
  id: "c1", slug: "isekai-fans", name: "Isekai Fans", description: "desc",
  memberCount: 3, createdBy: "u-owner", createdAt: "2026-02-01T00:00:00Z",
};

const members: CommunityMember[] = [
  { userId: "u-owner", role: "owner", username: "owner1", displayName: "Owner One", avatarUrl: null },
  { userId: "u-mod", role: "moderator", username: "mod1", displayName: null, avatarUrl: null },
  { userId: "u-member", role: "member", username: "member1", displayName: null, avatarUrl: null },
];

beforeEach(() => {
  setMemberRole.mockClear();
  banMember.mockClear();
  unbanMember.mockClear();
  deleteCommunity.mockClear();
  push.mockClear();
  refresh.mockClear();
});

describe("CommunityManagePanel", () => {
  it("as owner: shows Promote/Demote + Ban on non-owner rows, and Delete community", async () => {
    render(<CommunityManagePanel community={community} viewerRole="owner" initialMembers={members} />);
    expect(screen.getByText("@owner1")).toBeInTheDocument();
    expect(screen.getByText("@mod1")).toBeInTheDocument();
    expect(screen.getByText("@member1")).toBeInTheDocument();

    // owner row: no controls
    const ownerRow = screen.getByText("@owner1").closest("[data-testid='member-row']") as HTMLElement;
    expect(ownerRow).toBeTruthy();
    expect(ownerRow && ownerRow.querySelector("button")).toBeNull();

    // mod row: demote + ban
    const modRow = screen.getByText("@mod1").closest("[data-testid='member-row']") as HTMLElement;
    expect(screen.getByRole("button", { name: /demote/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /demote/i }));
    await waitFor(() => expect(setMemberRole).toHaveBeenCalledWith(expect.anything(), "c1", "u-mod", "member"));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(modRow.querySelector("button[aria-label='Ban mod1'], button")).toBeTruthy();

    // member row: promote + ban
    const memberRow = screen.getByText("@member1").closest("[data-testid='member-row']") as HTMLElement;
    const { getByRole } = within(memberRow);
    fireEvent.click(getByRole("button", { name: /promote/i }));
    await waitFor(() => expect(setMemberRole).toHaveBeenCalledWith(expect.anything(), "c1", "u-member", "moderator"));

    const banButtons = screen.getAllByRole("button", { name: /^ban$/i });
    expect(banButtons.length).toBe(2);
    fireEvent.click(banButtons[0]);
    await waitFor(() => expect(banMember).toHaveBeenCalled());

    expect(screen.getByRole("button", { name: /delete community/i })).toBeInTheDocument();
  });

  it("as owner: clicking Delete community confirms, calls deleteCommunity, and routes to /communities", async () => {
    window.confirm = vi.fn(() => true);
    render(<CommunityManagePanel community={community} viewerRole="owner" initialMembers={members} />);
    fireEvent.click(screen.getByRole("button", { name: /delete community/i }));
    await waitFor(() => expect(deleteCommunity).toHaveBeenCalledWith(expect.anything(), "c1"));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/communities"));
  });

  it("as owner: does not delete when confirm is cancelled", async () => {
    window.confirm = vi.fn(() => false);
    render(<CommunityManagePanel community={community} viewerRole="owner" initialMembers={members} />);
    fireEvent.click(screen.getByRole("button", { name: /delete community/i }));
    await waitFor(() => expect(window.confirm).toHaveBeenCalled());
    expect(deleteCommunity).not.toHaveBeenCalled();
  });

  it("as moderator: hides role controls and Delete community; shows Ban only on plain member rows", async () => {
    render(<CommunityManagePanel community={community} viewerRole="moderator" initialMembers={members} />);
    expect(screen.queryByRole("button", { name: /promote/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /demote/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /delete community/i })).toBeNull();

    const banButtons = screen.getAllByRole("button", { name: /^ban$/i });
    expect(banButtons.length).toBe(1);
    fireEvent.click(banButtons[0]);
    await waitFor(() => expect(banMember).toHaveBeenCalledWith(expect.anything(), "c1", "u-member"));
  });

  it("maps rpc errors to an inline error line", async () => {
    setMemberRole.mockResolvedValueOnce({ ok: false, error: "forbidden" });
    render(<CommunityManagePanel community={community} viewerRole="owner" initialMembers={members} />);
    fireEvent.click(screen.getByRole("button", { name: /demote/i }));
    expect(await screen.findByText(/not allowed|forbidden/i)).toBeInTheDocument();
  });

  it("renders a Banned section and Unban calls unbanMember", async () => {
    const bans: BannedMember[] = [
      { userId: "u-ban", username: "banned1", displayName: null, avatarUrl: null, bannedBy: "u-owner", createdAt: "2026-02-02T00:00:00Z" },
    ];
    render(<CommunityManagePanel community={community} viewerRole="owner" initialMembers={members} initialBans={bans} />);
    const bannedRow = screen.getByText("@banned1").closest("[data-testid='banned-row']") as HTMLElement;
    expect(bannedRow).toBeTruthy();
    fireEvent.click(within(bannedRow).getByRole("button", { name: /unban/i }));
    await waitFor(() => expect(unbanMember).toHaveBeenCalledWith(expect.anything(), "c1", "u-ban"));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it("shows no Banned section when there are no bans", () => {
    render(<CommunityManagePanel community={community} viewerRole="owner" initialMembers={members} initialBans={[]} />);
    expect(screen.queryByTestId("banned-row")).toBeNull();
  });
});
