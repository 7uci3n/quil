import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { Sqlite } from "../../src/db/index.js";
import {
  createTestDb,
  seedTestPlayer,
  cleanupTestDb,
} from "../fixtures/test-db.js";
import { makeInteraction, makeUser } from "../fixtures/mock-interactions.js";
import { chunkString, showCharacterEmbed } from "../../src/utils/embeds.js";

describe("chunkString", () => {
  it("splits text into fixed-size chunks", () => {
    expect(chunkString("abcdef", 2)).toEqual(["ab", "cd", "ef"]);
  });
  it("returns a single chunk when text is shorter than the limit", () => {
    expect(chunkString("abc", 10)).toEqual(["abc"]);
  });
  it("returns an empty array for empty text", () => {
    expect(chunkString("", 5)).toEqual([]);
  });
});

describe("showCharacterEmbed (real DB)", () => {
  let db: Sqlite;
  beforeEach(async () => {
    db = await createTestDb();
  });
  afterEach(async () => {
    await cleanupTestDb(db);
  });

  it("renders the default character card for the caller", async () => {
    const caller = makeUser({ id: "c1", displayName: "Caller" });
    await seedTestPlayer(db, {
      userId: "c1",
      name: "Hero",
      level: 4,
      xp: 2700,
      cp: 5000,
      tp: 2,
      active: true,
    });
    const { ix, reply } = makeInteraction({
      user: caller,
      users: { user: null },
    });
    await showCharacterEmbed(ix);
    const arg = reply.mock.calls[0]![0] as {
      embeds: { data: { fields: { name: string; value: string }[] } }[];
    };
    const fields = arg.embeds[0]!.data.fields;
    expect(fields.some((f) => f.name === "Level")).toBe(true);
    // 5000 cp → 50.00 GP
    expect(fields.find((f) => f.name.includes("Gold"))!.value).toContain(
      "50.00",
    );
  });

  it("targets another user via the 'user' option", async () => {
    const caller = makeUser({ id: "c1" });
    const target = makeUser({ id: "t1" });
    await seedTestPlayer(db, {
      userId: "t1",
      name: "Target",
      active: true,
    });
    const { ix, reply } = makeInteraction({
      user: caller,
      users: { user: target },
    });
    await showCharacterEmbed(ix, { title: "Custom Title" });
    const arg = reply.mock.calls[0]![0] as { embeds: unknown[] };
    expect(arg.embeds.length).toBe(1);
  });

  it("replies not-in-system when the target has no character", async () => {
    const caller = makeUser({ id: "nobody" });
    const { ix, reply } = makeInteraction({
      user: caller,
      users: { user: null },
    });
    await showCharacterEmbed(ix);
    const arg = reply.mock.calls[0]![0] as { content: string; flags: number };
    expect(typeof arg.content).toBe("string");
    expect(arg.flags).toBeDefined();
  });

  it("honors a content override", async () => {
    const caller = makeUser({ id: "c1" });
    await seedTestPlayer(db, { userId: "c1", name: "Hero", active: true });
    const { ix, reply } = makeInteraction({
      user: caller,
      users: { user: null },
    });
    await showCharacterEmbed(ix, { content: "hello" });
    const arg = reply.mock.calls[0]![0] as { content?: string };
    expect(arg.content).toBe("hello");
  });
});
