import { describe, it, expect } from "vitest";
import { normalizeUsername, validateUsername, RESERVED_USERNAMES } from "@/lib/profile/username";

describe("normalizeUsername", () => {
  it("trims and lowercases", () => {
    expect(normalizeUsername("  AzizDos  ")).toBe("azizdos");
  });
});

describe("validateUsername", () => {
  it("accepts a valid handle and returns the normalized value", () => {
    expect(validateUsername("Aziz_01")).toEqual({ ok: true, value: "aziz_01" });
  });
  it("rejects too short (<3)", () => {
    expect(validateUsername("ab")).toEqual({ ok: false, error: "too_short" });
  });
  it("rejects too long (>20)", () => {
    expect(validateUsername("a".repeat(21))).toEqual({ ok: false, error: "too_long" });
  });
  it("rejects invalid characters", () => {
    expect(validateUsername("bad name!")).toEqual({ ok: false, error: "invalid_chars" });
  });
  it("rejects reserved names case-insensitively", () => {
    expect(validateUsername("Admin")).toEqual({ ok: false, error: "reserved" });
    expect(RESERVED_USERNAMES.has("settings")).toBe(true);
  });
});
