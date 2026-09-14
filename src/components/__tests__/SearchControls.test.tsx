import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

import { SearchControls } from "@/components/SearchControls";

describe("SearchControls", () => {
  beforeEach(() => push.mockClear());

  it("navigates to a search URL with the query and type", async () => {
    render(<SearchControls initial={{ q: "", type: "ANIME", format: "" }} />);
    await userEvent.type(screen.getByRole("searchbox"), "cowboy");
    await userEvent.click(screen.getByRole("button", { name: /search/i }));
    expect(push).toHaveBeenCalledWith(expect.stringContaining("q=cowboy"));
    expect(push).toHaveBeenCalledWith(expect.stringContaining("type=ANIME"));
  });
});
