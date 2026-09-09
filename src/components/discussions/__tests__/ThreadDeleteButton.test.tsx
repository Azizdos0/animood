import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

const deleteThread = vi.fn(async (..._a: unknown[]) => {});
vi.mock("@/lib/discussions/queries", () => ({
  deleteThread: (...a: unknown[]) => deleteThread(...a),
}));

let user: { id: string } | null = null;
vi.mock("@/lib/supabase/client", () => ({
  supabaseBrowser: () => ({ auth: { getUser: async () => ({ data: { user } }) } }),
}));

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

import { ThreadDeleteButton } from "@/components/discussions/ThreadDeleteButton";

beforeEach(() => {
  user = null;
  deleteThread.mockClear();
  push.mockClear();
});

describe("ThreadDeleteButton", () => {
  it("renders the Delete thread button when the viewer is the author", async () => {
    user = { id: "u1" };
    render(<ThreadDeleteButton threadId="t1" mediaId={5} authorId="u1" />);
    expect(await screen.findByRole("button", { name: /delete thread/i })).toBeInTheDocument();
  });

  it("renders nothing when the viewer is not the author", async () => {
    user = { id: "u2" };
    render(<ThreadDeleteButton threadId="t1" mediaId={5} authorId="u1" />);
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("renders nothing when signed out", async () => {
    user = null;
    render(<ThreadDeleteButton threadId="t1" mediaId={5} authorId="u1" />);
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.queryByRole("button")).toBeNull();
  });
});
