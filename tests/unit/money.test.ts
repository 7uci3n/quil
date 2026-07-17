import { describe, it, expect } from "vitest";
import { toCp, toGp } from "../../src/utils/money.js";

describe("money conversions", () => {
  describe("toCp", () => {
    it("converts whole GP to copper", () => {
      expect(toCp(10)).toBe(1000);
    });
    it("rounds fractional GP to the nearest copper", () => {
      expect(toCp(5.5)).toBe(550);
      expect(toCp(0.014)).toBe(1); // rounds 1.4 → 1
    });
    it("handles zero", () => {
      expect(toCp(0)).toBe(0);
    });
  });

  describe("toGp", () => {
    it("formats copper as a 2-decimal GP string", () => {
      expect(toGp(12500)).toBe("125.00");
      expect(toGp(1)).toBe("0.01");
      expect(toGp(0)).toBe("0.00");
    });
    it("is the inverse of toCp for clean values", () => {
      expect(toGp(toCp(42))).toBe("42.00");
    });
  });
});
