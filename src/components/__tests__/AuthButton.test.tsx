import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const signIn = vi.fn();
let mockState = { user: null as null | { email: string | null; avatarUrl: string | null }, configured: true, signIn, signOut: vi.fn() };
vi.mock("@/components/SyncProvider", () => ({ useAuth: () => mockState }));

import { AuthButton } from "@/components/AuthButton";

describe("AuthButton", () => {
  it("shows Sign in when configured and signed out", () => {
    mockState = { ...mockState, user: null, configured: true };
    render(<AuthButton />);
    expect(screen.getByRole("button", { name: /sign in/i })).toBeInTheDocument();
  });

  it("shows the cloud-synced state when signed in", () => {
    mockState = { ...mockState, user: { email: "a@b.com", avatarUrl: null }, configured: true };
    render(<AuthButton />);
    expect(screen.getByText(/synced · cloud/i)).toBeInTheDocument();
  });

  it("falls back to the local chip when unconfigured", () => {
    mockState = { ...mockState, user: null, configured: false };
    render(<AuthButton />);
    expect(screen.getByText(/synced · local/i)).toBeInTheDocument();
  });
});
