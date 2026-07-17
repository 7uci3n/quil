import { describe, it, expect, vi } from "vitest";
import { t } from "../../src/lib/i18n.js";

describe("i18n t() (BUG-8)", () => {
  it("returns a real string for a known array key", () => {
    const s = t("retire.cancelled");
    expect(typeof s).toBe("string");
    expect(s.length).toBeGreaterThan(0);
  });

  it("interpolates params", () => {
    expect(t("swap.switched", { name: "Aragorn" })).toContain("Aragorn");
  });

  it('returns the key (not "[object Object]") when it points at a subtree', () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(t("retire")).toBe("retire"); // object node, not a leaf string
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("returns the key and warns for a missing key", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(t("this.key.does.not.exist")).toBe("this.key.does.not.exist");
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
