import { describe, it, expect, beforeEach } from "vitest";
import { getListOwner, setListOwner } from "@/lib/sync/owner";

describe("list owner tag", () => {
  beforeEach(() => localStorage.clear());

  it("returns null when no owner is set (anonymous local list)", () => {
    expect(getListOwner()).toBeNull();
  });

  it("stores and reads back an owning userId", () => {
    setListOwner("user-1");
    expect(getListOwner()).toBe("user-1");
  });

  it("clears the owner tag when set to null", () => {
    setListOwner("user-1");
    setListOwner(null);
    expect(getListOwner()).toBeNull();
  });

  it("overwrites a previous owner (shared-device handoff)", () => {
    setListOwner("user-1");
    setListOwner("user-2");
    expect(getListOwner()).toBe("user-2");
  });
});
