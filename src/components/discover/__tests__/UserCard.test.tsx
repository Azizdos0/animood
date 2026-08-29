import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { UserCard } from "@/components/discover/UserCard";

describe("UserCard", () => {
  it("links to the user's profile and shows the handle", () => {
    render(<UserCard user={{ username: "aziz", displayName: "Aziz", avatarUrl: null }} />);
    const link = screen.getByRole("link", { name: /aziz/i });
    expect(link).toHaveAttribute("href", "/u/aziz");
    expect(screen.getByText("@aziz")).toBeInTheDocument();
  });
});
