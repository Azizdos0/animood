import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MediaList } from "@/components/MediaList";
import type { ListEntry } from "@/lib/list/schema";

const entry = (o: Partial<ListEntry> = {}): ListEntry => ({
  status: "completed", score: 8, progress: 12, updatedAt: "2026-01-01T00:00:00Z", isFavorite: false, ...o,
});

beforeEach(() => {
  global.fetch = vi.fn(async () => ({
    ok: true, json: async () => ({ items: [{ id: 1, title: "Cowboy Bebop", type: "ANIME", coverImage: null, episodes: 26 }] }),
  })) as never;
});

describe("MediaList", () => {
  it("renders rows from the entries prop", async () => {
    render(<MediaList entries={{ 1: entry() }} interactive={false} />);
    expect(await screen.findByText("Cowboy Bebop")).toBeInTheDocument();
  });
  it("hides the +1 control when interactive is false", async () => {
    render(<MediaList entries={{ 1: entry() }} interactive={false} />);
    await screen.findByText("Cowboy Bebop");
    expect(screen.queryByRole("button", { name: "Add one" })).toBeNull();
  });
  it("shows an empty state for no entries", () => {
    render(<MediaList entries={{}} interactive={false} />);
    expect(screen.getByText(/no titles/i)).toBeInTheDocument();
  });
});
