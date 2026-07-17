import { describe, it, expect, beforeEach } from "vitest";
import { makeAutocomplete } from "../fixtures/mock-interactions.js";
import { autocomplete } from "../../src/utils/autocomplete.js";
import { StoryCache, CharCache } from "../../src/utils/db_queries.js";

describe("autocomplete", () => {
  beforeEach(() => {
    StoryCache.genres = ["Fantasy", "Mystery", "Horror"];
    StoryCache.allTitles = ["Aardvark", "Basilisk", "Cyclops"];
    StoryCache.titlesByGenre = new Map([["Fantasy", ["Basilisk", "Cyclops"]]]);
    CharCache.charsByUser = new Map([
      ["user-1", ["Aria", "Aldric", "Borin"]],
      ["user-2", ["Zara"]],
    ]);
  });

  it("suggests genres, filtered by the focused value", async () => {
    const { ix, respond } = makeAutocomplete({
      focused: { name: "genre", value: "st" },
    });
    await autocomplete(ix);
    const choices = respond.mock.calls[0]![0] as { value: string }[];
    expect(choices.map((c) => c.value)).toEqual(["Mystery"]);
  });

  it("suggests titles within the chosen genre", async () => {
    const { ix, respond } = makeAutocomplete({
      focused: { name: "title", value: "" },
      strings: { genre: "Fantasy" },
    });
    await autocomplete(ix);
    const choices = respond.mock.calls[0]![0] as { value: string }[];
    expect(choices.map((c) => c.value)).toEqual(["Basilisk", "Cyclops"]);
  });

  it("suggests all titles when no genre is chosen", async () => {
    const { ix, respond } = makeAutocomplete({
      focused: { name: "title", value: "a" },
      strings: { genre: null },
    });
    await autocomplete(ix);
    const choices = respond.mock.calls[0]![0] as { value: string }[];
    // "a" matches Aardvark and Basilisk (contains 'a')
    expect(choices.map((c) => c.value)).toEqual(["Aardvark", "Basilisk"]);
  });

  it("suggests the caller's characters for a 'character'/user field", async () => {
    const { ix, respond } = makeAutocomplete({
      focused: { name: "name", value: "al" },
      userId: "user-1",
    });
    await autocomplete(ix);
    const choices = respond.mock.calls[0]![0] as { value: string }[];
    expect(choices.map((c) => c.value)).toEqual(["Aldric"]);
  });

  it("maps charN to userN when resolving character names", async () => {
    const { ix, respond } = makeAutocomplete({
      focused: { name: "char2", value: "" },
      raw: { user2: { value: "user-2" } },
    });
    await autocomplete(ix);
    const choices = respond.mock.calls[0]![0] as { value: string }[];
    expect(choices.map((c) => c.value)).toEqual(["Zara"]);
  });

  it("limits suggestions to 25", async () => {
    CharCache.charsByUser = new Map([
      ["user-1", Array.from({ length: 40 }, (_, i) => `Char${i}`)],
    ]);
    const { ix, respond } = makeAutocomplete({
      focused: { name: "name", value: "char" },
      userId: "user-1",
    });
    await autocomplete(ix);
    const choices = respond.mock.calls[0]![0] as { value: string }[];
    expect(choices.length).toBe(25);
  });
});
