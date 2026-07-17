import { describe, it, expect } from "vitest";
import { deepMerge } from "../../src/config/resolved.js";

describe("deepMerge (dev-config override, ADR-0008)", () => {
  it("recursively merges nested objects, keeping unspecified siblings", () => {
    const base = { a: 1, b: { c: 2, d: 3 } };
    expect(deepMerge(base, { b: { c: 9 } })).toEqual({
      a: 1,
      b: { c: 9, d: 3 },
    });
  });

  it("replaces arrays wholesale rather than merging them", () => {
    expect(deepMerge({ a: [1, 2, 3] }, { a: [9] })).toEqual({ a: [9] });
  });

  it("replaces primitive leaves", () => {
    expect(deepMerge({ a: 1, b: 2 }, { b: 20 })).toEqual({ a: 1, b: 20 });
  });

  it("returns the target unchanged when the override is undefined", () => {
    const base = { a: 1, b: { c: 2 } };
    expect(deepMerge(base, undefined)).toEqual({ a: 1, b: { c: 2 } });
  });

  it("does not mutate the target", () => {
    const base = { a: 1, b: { c: 2 } };
    const out = deepMerge(base, { b: { c: 99 } });
    expect(base).toEqual({ a: 1, b: { c: 2 } });
    expect(out).not.toBe(base);
  });

  it("merges a realistic partial guild-config override", () => {
    const base = {
      guild: {
        id: "prod-guild",
        config: { roles: { admin: { id: "prod-admin" } }, name: "Remnant" },
      },
    };
    const out = deepMerge(base, {
      guild: {
        id: "dev-guild",
        config: { roles: { admin: { id: "dev-admin" } } },
      },
    });
    expect(out).toEqual({
      guild: {
        id: "dev-guild",
        config: { roles: { admin: { id: "dev-admin" } }, name: "Remnant" },
      },
    });
  });
});
