import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { StatsBoard } from "@/components/StatsBoard";
import type { ListEntry } from "@/lib/list/schema";

beforeEach(() => {
  global.fetch = vi.fn(async () => ({
    ok: true, json: async () => ({ items: [{ id: 1, title: "X", type: "ANIME", genres: ["Action"], episodes: 12, coverImage: null }] }),
  })) as never;
});

const e: ListEntry = { status: "completed", score: 9, progress: 12, updatedAt: "2026-01-01T00:00:00Z", isFavorite: false };

describe("StatsBoard", () => {
  it("renders stat tiles from the entries prop", async () => {
    render(<StatsBoard entries={{ 1: e }} />);
    expect(await screen.findByText("Titles")).toBeInTheDocument();
  });
  it("hides the share card control when showShareCard is false", async () => {
    render(<StatsBoard entries={{ 1: e }} showShareCard={false} />);
    await screen.findByText("Titles");
    expect(screen.queryByText(/create share card/i)).toBeNull();
  });
});
