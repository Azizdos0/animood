import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MediaCard } from "@/components/MediaCard";
import { MediaGrid } from "@/components/MediaGrid";
import { setEntry, __resetListCacheForTests } from "@/lib/list/reactive";

const item = { id: 21, title: "One Piece", coverImage: "op.jpg", format: "TV" };

describe("MediaCard", () => {
  beforeEach(() => {
    localStorage.clear();
    __resetListCacheForTests();
  });

  it("renders title and a link to the detail page", () => {
    render(<MediaCard media={item} />);
    expect(screen.getByText("One Piece")).toBeInTheDocument();
    expect(screen.getByRole("link")).toHaveAttribute("href", "/media/21");
  });

  it("shows a status badge when the title is on the list", () => {
    setEntry(21, { status: "watching" });
    render(<MediaCard media={item} />);
    expect(screen.getByText(/watching/i)).toBeInTheDocument();
  });

  it("MediaGrid renders an empty state when there are no items", () => {
    render(<MediaGrid items={[]} />);
    expect(screen.getByText(/nothing here/i)).toBeInTheDocument();
  });
});
