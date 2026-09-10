import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { activateListAccount, LIST_STORAGE_KEY, listStorageKey, loadStore, upsertEntry } from "../storage";
import { getListOwner, setListOwner } from "@/lib/sync/owner";

beforeEach(() => { localStorage.clear(); activateListAccount(null); });
afterEach(() => { vi.restoreAllMocks(); localStorage.clear(); activateListAccount(null); });

describe("account storage", () => {
  it("keeps guest and account edits in separate storage namespaces", () => {
    upsertEntry(1, { progress: 3 });
    activateListAccount("A");
    activateListAccount(null);
    upsertEntry(2, { progress: 5 });
    activateListAccount("B");
    expect(Object.keys(loadStore().entries)).toEqual(["2"]);
    activateListAccount("A");
    expect(Object.keys(loadStore().entries)).toEqual(["1"]);
    expect(JSON.parse(localStorage.getItem(listStorageKey("B"))!).entries[2].progress).toBe(5);
  });

  it("hides legacy account data before auth initializes", () => {
    upsertEntry(1, { score: 9 }); setListOwner("A");
    expect(loadStore().entries).toEqual({});
    activateListAccount(null);
    expect(loadStore().entries).toEqual({});
    activateListAccount("A");
    expect(loadStore().entries[1].score).toBe(9);
  });

  it("preserves the source and owner if copying a legacy list fails", () => {
    upsertEntry(1, { score: 9 }); setListOwner("A");
    const original = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(function(this: Storage, key, value) {
      if (key === listStorageKey("A")) throw new Error("storage full");
      original.call(this, key, value);
    });
    expect(() => activateListAccount("B")).toThrow("storage full");
    expect(loadStore().entries).toEqual({});
    expect(localStorage.getItem(LIST_STORAGE_KEY)).toContain('"score":9');
    expect(getListOwner()).toBe("A");
    vi.restoreAllMocks();
    activateListAccount("B");
    expect(loadStore().entries).toEqual({});
    activateListAccount("A");
    expect(loadStore().entries[1].score).toBe(9);
  });

  it("recovers a migration interrupted after copying and removing the shared slot", () => {
    setListOwner("A");
    activateListAccount(null);
    upsertEntry(2, { progress: 4 });
    expect(loadStore().entries[2]?.progress).toBe(4);
  });
});
