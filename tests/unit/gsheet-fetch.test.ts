import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";

vi.mock("axios", () => ({
  default: { get: vi.fn() },
}));

import axios from "axios";
import { fetchStoriesFromGoogleSheet } from "../../src/utils/gsheet.js";

const mockGet = (axios as unknown as { get: Mock }).get;

describe("fetchStoriesFromGoogleSheet", () => {
  beforeEach(() => {
    mockGet.mockReset();
  });

  it("parses CSV rows into stories", async () => {
    mockGet.mockResolvedValue({
      data: "The Ledger,Mystery,Once upon a time\nBeta,Saga,Body,Quil",
    });
    const stories = await fetchStoriesFromGoogleSheet();
    expect(stories).toHaveLength(2);
    expect(stories[0]!.title).toBe("The Ledger");
    expect(stories[1]!.author).toBe("Quil");
  });

  it("throws when Google returns an HTML error page", async () => {
    mockGet.mockResolvedValue({ data: "<!DOCTYPE html><html>error</html>" });
    await expect(fetchStoriesFromGoogleSheet()).rejects.toThrow(/non-CSV/);
  });
});
