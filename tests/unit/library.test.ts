import { describe, it, expect } from "vitest";
import {
  buildFooterText,
  resolveLibraryAction,
  nextPageIndex,
} from "../../src/commands/library.js";
import type { SheetStory } from "../../src/commands/library.js";

const story = (author?: string): SheetStory => ({
  title: "T",
  genre: "Fantasy",
  content: "…",
  ...(author ? { author } : {}),
});

describe("buildFooterText", () => {
  it("shows page and genre without author", () => {
    expect(buildFooterText(story(), 0, 3)).toBe("Page 1 / 3 • Genre: Fantasy");
  });
  it("appends the author when present", () => {
    expect(buildFooterText(story("Quil"), 1, 3)).toBe(
      "Page 2 / 3 • Genre: Fantasy • By Quil",
    );
  });
});

describe("resolveLibraryAction", () => {
  it("owner clicking lock toggles the lock", () => {
    expect(resolveLibraryAction("lock", true, false)).toBe("toggle-lock");
  });
  it("non-owner clicking lock is denied", () => {
    expect(resolveLibraryAction("lock", false, false)).toBe("deny-lock");
  });
  it("anyone may turn pages when unlocked", () => {
    expect(resolveLibraryAction("next", false, false)).toBe("turn");
    expect(resolveLibraryAction("prev", true, false)).toBe("turn");
  });
  it("owner may turn pages when locked", () => {
    expect(resolveLibraryAction("next", true, true)).toBe("turn");
  });
  it("non-owner may not turn pages when locked", () => {
    expect(resolveLibraryAction("next", false, true)).toBe("deny-turn");
  });
});

describe("nextPageIndex", () => {
  it("prev clamps at 0", () => {
    expect(nextPageIndex("prev", 0, 5)).toBe(0);
    expect(nextPageIndex("prev", 3, 5)).toBe(2);
  });
  it("next clamps at last page", () => {
    expect(nextPageIndex("next", 4, 5)).toBe(4);
    expect(nextPageIndex("next", 1, 5)).toBe(2);
  });
  it("unknown id leaves the index unchanged", () => {
    expect(nextPageIndex("lock", 2, 5)).toBe(2);
  });
});
