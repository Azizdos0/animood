import { describe, it, expect } from "vitest";
import { validateSlug, normalizeSlug } from "@/lib/communities/slug";

describe("validateSlug", () => {
  it("lowercases + trims", () => { expect(normalizeSlug("  Isekai_Fans ")).toBe("isekai_fans"); });
  it("accepts a valid slug", () => { expect(validateSlug("isekai-fans")).toEqual({ ok: true, value: "isekai-fans" }); });
  it("rejects too short", () => { expect(validateSlug("ab")).toEqual({ ok: false, error: "too_short" }); });
  it("rejects too long", () => { expect(validateSlug("a".repeat(31))).toEqual({ ok: false, error: "too_long" }); });
  it("rejects bad chars", () => { expect(validateSlug("bad slug!")).toEqual({ ok: false, error: "invalid_chars" }); });
  it("rejects reserved", () => { expect(validateSlug("new")).toEqual({ ok: false, error: "reserved" }); });
});
