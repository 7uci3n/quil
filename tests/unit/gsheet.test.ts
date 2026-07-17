import { describe, it, expect } from "vitest";
import { rowsToStories } from "../../src/utils/gsheet.js";

describe("rowsToStories", () => {
  it("maps a 3-column row to a story with no author", () => {
    const stories = rowsToStories([
      ["The Ledger", "Mystery", "Once upon a time"],
    ]);
    expect(stories).toEqual([
      { title: "The Ledger", genre: "Mystery", content: "Once upon a time" },
    ]);
    expect(stories[0]!.author).toBeUndefined();
  });

  it("reads a 4th column as the author", () => {
    const stories = rowsToStories([
      ["The Ledger", "Mystery", "Once upon a time", "Quil"],
    ]);
    expect(stories[0]).toEqual({
      title: "The Ledger",
      genre: "Mystery",
      content: "Once upon a time",
      author: "Quil",
    });
  });

  it("omits a blank/whitespace author", () => {
    const stories = rowsToStories([["T", "G", "C", "   "]]);
    expect(stories[0]!.author).toBeUndefined();
    expect("author" in stories[0]!).toBe(false);
  });

  it("trims all fields", () => {
    const stories = rowsToStories([["  T  ", " G ", " C ", " A "]]);
    expect(stories[0]).toEqual({
      title: "T",
      genre: "G",
      content: "C",
      author: "A",
    });
  });

  it("skips rows missing a required field", () => {
    const stories = rowsToStories([
      ["T", "G", ""], // empty content
      ["", "G", "C"], // empty title
      ["T2", "G2", "C2"], // valid
    ]);
    expect(stories).toHaveLength(1);
    expect(stories[0]!.title).toBe("T2");
  });

  it("skips rows with fewer than 3 columns", () => {
    expect(rowsToStories([["T", "G"]])).toEqual([]);
  });
});
