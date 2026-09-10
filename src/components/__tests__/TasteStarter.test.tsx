import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { TasteStarter } from "../discovery/TasteStarter";
import { getDiscoverySnapshot } from "@/lib/recommend/preferences";
import { getSnapshot, setListAccount } from "@/lib/list/reactive";

describe("taste starter", () => {
  beforeEach(() => { localStorage.clear(); setListAccount(null); });
  afterEach(() => vi.unstubAllGlobals());
  it("saves exactly three favorites without creating list entries or ratings", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ items: [1, 2, 3, 4].map(id => ({ id, title: `Favorite ${id}`, coverImage: null })) }) }));
    const close = vi.fn();
    render(<TasteStarter initial={[]} type="ANIME" onClose={close} />);
    const save = screen.getByRole("button", { name: "Use these 3 favorites" });
    expect(save).toBeDisabled();
    fireEvent.click(await screen.findByRole("button", { name: "Favorite 1" }));
    fireEvent.click(screen.getByRole("button", { name: "Favorite 2" }));
    fireEvent.click(screen.getByRole("button", { name: "Favorite 3" }));
    expect(screen.getByRole("button", { name: "Favorite 4" })).toBeDisabled();
    fireEvent.click(save);
    expect(getDiscoverySnapshot().seeds.map(s => s.id)).toEqual([1, 2, 3]);
    expect(getSnapshot().entries).toEqual({});
    expect(close).toHaveBeenCalledOnce();
  });
  it("does not apply an older search response after a new query", async () => {
    let resolveOld!: (value: unknown) => void;
    const fetchMock = vi.fn().mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve; }))
      .mockResolvedValue({ ok: true, json: async () => ({ items: [{ id: 2, title: "New result", coverImage: null }] }) });
    vi.stubGlobal("fetch", fetchMock);
    render(<TasteStarter initial={[]} type="ANIME" onClose={() => {}} />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    fireEvent.change(screen.getByRole("textbox", { name: "Search favorites" }), { target: { value: "new" } });
    await screen.findByRole("button", { name: "New result" });
    resolveOld({ ok: true, json: async () => ({ items: [{ id: 1, title: "Old result", coverImage: null }] }) });
    await waitFor(() => expect(screen.queryByRole("button", { name: "Old result" })).toBeNull());
    expect(screen.getByRole("button", { name: "New result" })).toBeInTheDocument();
  });
});
