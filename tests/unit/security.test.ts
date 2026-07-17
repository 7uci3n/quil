import { describe, it, expect } from "vitest";
import { deriveEnv, parseCsv } from "../../src/config/resolved.js";
import { shouldRefuseWipe } from "../../src/scripts/guards.js";

describe("deriveEnv (SEC-2)", () => {
  it("maps production -> prod", () => {
    expect(deriveEnv("production")).toBe("prod");
  });
  it("maps everything else -> dev", () => {
    expect(deriveEnv(undefined)).toBe("dev");
    expect(deriveEnv("development")).toBe("dev");
    expect(deriveEnv("test")).toBe("dev");
    expect(deriveEnv("prod")).toBe("dev"); // only literal "production" is prod
  });
});

describe("parseCsv (SEC-3)", () => {
  it("empty / undefined -> []", () => {
    expect(parseCsv(undefined)).toEqual([]);
    expect(parseCsv("")).toEqual([]);
    expect(parseCsv("  ,  , ")).toEqual([]);
  });
  it("trims and drops blanks", () => {
    expect(parseCsv(" a , b ,,c ")).toEqual(["a", "b", "c"]);
  });
});

describe("shouldRefuseWipe (SEC-4)", () => {
  it("refuses in production without force", () => {
    expect(shouldRefuseWipe("production", false)).toBe(true);
  });
  it("allows in production with force", () => {
    expect(shouldRefuseWipe("production", true)).toBe(false);
  });
  it("allows outside production", () => {
    expect(shouldRefuseWipe("development", false)).toBe(false);
    expect(shouldRefuseWipe(undefined, false)).toBe(false);
  });
});
