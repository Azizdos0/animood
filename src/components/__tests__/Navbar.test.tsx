import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { Navbar } from "@/components/Navbar";
import { toCardData } from "@/components/MediaRow";

vi.mock("next/navigation", () => ({ usePathname: () => "/" }));

describe("Navbar", () => {
  it("renders the primary nav links", () => {
    render(<Navbar />);
    expect(screen.getByRole("link", { name: /animood/i })).toHaveAttribute("href", "/");
    // Search / My List appear in both the desktop bar and the mobile bottom nav.
    expect(screen.getAllByRole("link", { name: /search/i })[0]).toHaveAttribute("href", "/search");
    expect(screen.getAllByRole("link", { name: /my list/i })[0]).toHaveAttribute("href", "/my-list");
  });

  it("marks the active route with aria-current", () => {
    render(<Navbar />);
    // pathname is mocked to "/", so the Home bottom-nav item is current.
    expect(screen.getAllByRole("link", { name: /home/i })[0]).toHaveAttribute("aria-current", "page");
  });
});

describe("toCardData", () => {
  it("maps a Media to card props", () => {
    const card = toCardData({
      id: 9, title: "Naruto", coverImage: "n.jpg", format: "TV",
    } as never);
    expect(card).toEqual({ id: 9, title: "Naruto", coverImage: "n.jpg", format: "TV" });
  });
});
