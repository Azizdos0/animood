import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";

const setVis = vi.fn(async (..._a: unknown[]) => {});
vi.mock("@/lib/profile/queries", () => ({ setProfileVisibility: (...a: unknown[]) => setVis(...a) }));
vi.mock("@/lib/supabase/client", () => ({ supabaseBrowser: () => ({}) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

import { ProfileOwnerBar } from "@/components/profile/ProfileOwnerBar";

describe("ProfileOwnerBar", () => {
  it("toggles visibility", async () => {
    render(<ProfileOwnerBar userId="u1" isPublic={true} />);
    await userEvent.click(screen.getByRole("button", { name: /make private/i }));
    expect(setVis).toHaveBeenCalledWith(expect.anything(), "u1", false);
  });
});
