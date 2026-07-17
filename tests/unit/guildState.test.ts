import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { Sqlite } from "../../src/db/index.js";
import { createTestDb, cleanupTestDb } from "../fixtures/test-db.js";
import { getGuildState, setGuildState } from "../../src/domain/guildState.js";

describe("guildState (real DB)", () => {
  let db: Sqlite;
  beforeEach(async () => {
    db = await createTestDb();
  });
  afterEach(async () => {
    await cleanupTestDb(db);
  });

  it("returns null for an unset key", async () => {
    expect(await getGuildState("g1", "missing")).toBeNull();
  });

  it("stores and reads back a value", async () => {
    await setGuildState("g1", "board", "msg-123");
    expect(await getGuildState("g1", "board")).toBe("msg-123");
  });

  it("upserts on conflict (same guild + key)", async () => {
    await setGuildState("g1", "board", "old");
    await setGuildState("g1", "board", "new");
    expect(await getGuildState("g1", "board")).toBe("new");
  });

  it("scopes values per guild", async () => {
    await setGuildState("g1", "board", "one");
    await setGuildState("g2", "board", "two");
    expect(await getGuildState("g1", "board")).toBe("one");
    expect(await getGuildState("g2", "board")).toBe("two");
  });
});
