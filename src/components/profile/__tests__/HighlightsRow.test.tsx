import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { HighlightsRow } from "@/components/profile/HighlightsRow";

beforeEach(() => {
  global.fetch = vi.fn(async () => ({
    ok: true, json: async () => ({ items: [{ id: 3, title: "FMA", type: "ANIME", coverImage: null }] }),
  })) as never;
});

describe("HighlightsRow", () => {
  it("renders nothing when there are no favorites", () => {
    const { container } = render(<HighlightsRow favoriteIds={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
  it("renders favorite titles", async () => {
    render(<HighlightsRow favoriteIds={[3]} />);
    expect(await screen.findByText("FMA")).toBeInTheDocument();
  });
});
