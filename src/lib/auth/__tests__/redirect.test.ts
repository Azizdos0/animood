import { describe, it, expect } from "vitest";
import { safeNextPath } from "@/lib/auth/redirect";

describe("safeNextPath", () => {
  it("keeps same-site paths with their query", () => {
    expect(safeNextPath("/media/1?tab=cast")).toBe("/media/1?tab=cast");
  });
  it.each([null, undefined, "", "https://evil.com", "//evil.com", "/\\evil.com", "evil.com"])(
    "falls back to / for %s", (value) => {
      expect(safeNextPath(value)).toBe("/");
    });
});
