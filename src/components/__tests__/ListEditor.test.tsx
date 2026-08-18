import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ListEditor } from "@/components/ListEditor";
import { getEntry } from "@/lib/list/storage";
import { __resetListCacheForTests } from "@/lib/list/reactive";

describe("ListEditor", () => {
  beforeEach(() => {
    localStorage.clear();
    __resetListCacheForTests();
  });

  it("adds a title to the list as planning", async () => {
    render(<ListEditor mediaId={42} />);
    await userEvent.click(screen.getByRole("button", { name: /add to list/i }));
    expect(getEntry(42)?.status).toBe("planning");
    expect(screen.getByRole("button", { name: /remove/i })).toBeInTheDocument();
  });

  it("changes status through the select", async () => {
    render(<ListEditor mediaId={42} />);
    await userEvent.click(screen.getByRole("button", { name: /add to list/i }));
    await userEvent.selectOptions(screen.getByLabelText(/status/i), "completed");
    expect(getEntry(42)?.status).toBe("completed");
  });

  it("removes a title from the list", async () => {
    render(<ListEditor mediaId={42} />);
    await userEvent.click(screen.getByRole("button", { name: /add to list/i }));
    await userEvent.click(screen.getByRole("button", { name: /remove/i }));
    expect(getEntry(42)).toBeNull();
  });
});
