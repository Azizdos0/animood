import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import HomePage from "../page";
vi.mock("@/lib/anilist/media", () => ({ getTrending: vi.fn().mockRejectedValue(new Error("offline")) }));
vi.mock("@/components/home/InProgress", () => ({ InProgress: () => <div>My progress</div> }));
vi.mock("@/components/home/HeroStats", () => ({ HeroStats: () => null }));

describe("home discovery", () => {
  it("keeps mood discovery and progress available when trending fails", async () => {
    render(await HomePage());
    expect(screen.getByRole("link", { name: /find my next favorite/i })).toHaveAttribute("href", "/recommendations");
    expect(screen.getByRole("link", { name: /soft & slow/i })).toHaveAttribute("href", expect.stringContaining("mood=calm"));
    expect(screen.getByText("My progress")).toBeInTheDocument();
  });
});
