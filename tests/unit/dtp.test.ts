import { describe, it, expect } from "vitest";
import { dtpPeriod, dtpDayBoundary } from "../../src/domain/dtp.js";

describe("dtpPeriod (DATA-5)", () => {
  it("divides a day by the rate, rounded", () => {
    expect(dtpPeriod(1)).toBe(86400);
    expect(dtpPeriod(2)).toBe(43200);
  });
  it("treats rate < 1 as 1 (no divide-by-zero)", () => {
    expect(dtpPeriod(0)).toBe(86400);
  });
});

describe("dtpDayBoundary (DATA-5)", () => {
  it("floors to the period boundary (rate 2 -> 43200)", () => {
    expect(dtpDayBoundary(43200 + 100, 2)).toBe(43200);
    expect(dtpDayBoundary(43199, 2)).toBe(0);
    expect(dtpDayBoundary(86400, 2)).toBe(86400);
  });
  it("rounds fractional seconds before flooring", () => {
    expect(dtpDayBoundary(43200.9, 2)).toBe(43200);
  });
});
