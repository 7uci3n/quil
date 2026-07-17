import { describe, it, expect } from "vitest";
import { levelChangeMessage } from "../../src/utils/announce.js";

describe("levelChangeMessage (D5 — unified, always pings)", () => {
  it("level up: pings the user and shows level + proficiency", () => {
    const msg = levelChangeMessage("123", "Aragorn", 5, +1);
    expect(msg).toContain("<@123>"); // Discord mention/ping
    expect(msg).toContain("Aragorn");
    expect(msg).toContain("5");
  });

  it("level down: pings the user and shows the new level", () => {
    const msg = levelChangeMessage("123", "Aragorn", 4, -1);
    expect(msg).toContain("<@123>");
    expect(msg).toContain("4");
  });
});
