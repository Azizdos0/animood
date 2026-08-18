import { describe, it, expect } from "vitest";
import { formatMinutes, formatNumber } from "@/lib/stats/format";

describe("formatMinutes", () => {
  it("formats days, hours and minutes, omitting zero units", () => {
    expect(formatMinutes(0)).toBe("0m");
    expect(formatMinutes(45)).toBe("45m");
    expect(formatMinutes(90)).toBe("1h 30m");
    expect(formatMinutes(1500)).toBe("1d 1h");   // 1500 = 25h = 1d 1h 0m -> "1d 1h"
  });
});

describe("formatNumber", () => {
  it("adds thousands separators", () => {
    expect(formatNumber(1234567)).toBe("1,234,567");
    expect(formatNumber(42)).toBe("42");
  });
});
