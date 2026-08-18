import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Navbar } from "@/components/Navbar";
import { toCardData } from "@/components/MediaRow";

describe("Navbar", () => {
  it("renders the primary nav links", () => {
    render(<Navbar />);
    expect(screen.getByRole("link", { name: /animood/i })).toHaveAttribute("href", "/");
    expect(screen.getByRole("link", { name: /search/i })).toHaveAttribute("href", "/search");
    expect(screen.getByRole("link", { name: /my list/i })).toHaveAttribute("href", "/my-list");
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
