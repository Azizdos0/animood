import { beforeEach, describe, expect, it } from "vitest";
import { setListAccount } from "@/lib/list/reactive";
import { getDiscoverySnapshot, updateDiscoveryPreferences } from "../preferences";

beforeEach(() => { localStorage.clear(); setListAccount(null); });
describe("discovery preferences", () => {
  it("persists hidden picks and can undo them", () => {
    updateDiscoveryPreferences({ hiddenIds: [42] });
    expect(getDiscoverySnapshot().hiddenIds).toEqual([42]);
    expect(Object.values(localStorage).some(raw => String(raw).includes('"hiddenIds":[42]'))).toBe(true);
    updateDiscoveryPreferences({ hiddenIds: [] });
    expect(getDiscoverySnapshot().hiddenIds).toEqual([]);
  });
  it("keeps favorites and feedback separate for guests and different accounts", () => {
    setListAccount("A");
    updateDiscoveryPreferences({ hiddenIds: [1], seeds: [{ id: 2, title: "A favorite", coverImage: null }] });
    setListAccount(null);
    expect(getDiscoverySnapshot().hiddenIds).toEqual([]);
    setListAccount("B");
    expect(getDiscoverySnapshot().seeds).toEqual([]);
    setListAccount("A");
    expect(getDiscoverySnapshot().hiddenIds).toEqual([1]);
    expect(getDiscoverySnapshot().seeds[0].title).toBe("A favorite");
  });
});
