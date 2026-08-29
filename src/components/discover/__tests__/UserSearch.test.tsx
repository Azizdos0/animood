import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
const searchUsers = vi.fn();
vi.mock("@/lib/discover/queries", () => ({ searchUsers: (...a: unknown[]) => searchUsers(...a) }));
vi.mock("@/lib/supabase/client", () => ({ isSupabaseConfigured: () => true, supabaseBrowser: () => ({}) }));
import { UserSearch } from "@/components/discover/UserSearch";

beforeEach(() => { searchUsers.mockReset(); });

describe("UserSearch", () => {
  it("shows results after typing a query", async () => {
    searchUsers.mockResolvedValue([{ username: "aziz", displayName: "Aziz", avatarUrl: null }]);
    render(<UserSearch />);
    await userEvent.type(screen.getByRole("textbox"), "azi");
    expect(await screen.findByText("@aziz")).toBeInTheDocument();
  });
  it("shows an empty state when no users match", async () => {
    searchUsers.mockResolvedValue([]);
    render(<UserSearch />);
    await userEvent.type(screen.getByRole("textbox"), "zzz");
    expect(await screen.findByText(/no users found/i)).toBeInTheDocument();
  });
});
