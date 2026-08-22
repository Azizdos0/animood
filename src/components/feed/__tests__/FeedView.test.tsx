import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { FeedView } from "@/components/feed/FeedView";
import type { FeedItem } from "@/lib/feed/types";

beforeEach(() => {
  global.fetch = vi.fn(async () => ({
    ok: true, json: async () => ({ items: [{ id: 5, title: "Cowboy Bebop", type: "ANIME", coverImage: null }] }),
  })) as never;
});

const item: FeedItem = {
  username: "friend", displayName: "Friend", avatarUrl: null,
  mediaId: 5, status: "completed", score: 9, updatedAt: "2026-02-01T00:00:00Z",
};

describe("FeedView", () => {
  it("renders an activity row with user, verb, and title", async () => {
    render(<FeedView items={[item]} />);
    expect(await screen.findByText("Cowboy Bebop")).toBeInTheDocument();
    expect(screen.getByText(/@friend/)).toBeInTheDocument();
    expect(screen.getByText(/completed/i)).toBeInTheDocument();
  });
  it("shows the empty state when there are no items", () => {
    render(<FeedView items={[]} />);
    expect(screen.getByText(/your feed is empty/i)).toBeInTheDocument();
  });
});
