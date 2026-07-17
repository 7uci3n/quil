import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { initDb, migrateDb, closeDb, getDb } from "../../src/db/index.js";
import {
  retireCharacter,
  setActive,
  getPlayer,
} from "../../src/utils/db_queries.js";

let dbFile: string;

async function seedChar(userId: string, name: string, active: number, cc = 0) {
  const db = getDb();
  await db.run(
    `INSERT INTO charlog (userId, name, level, xp, cp, tp, active, dtp, dtp_updated, cc)
     VALUES (?, ?, 1, 0, 0, 0, ?, 0, 0, ?)`,
    userId,
    name,
    active,
    cc,
  );
}

beforeEach(async () => {
  // Temp file (not :memory:) so init and migrate share one database.
  dbFile = path.join(
    os.tmpdir(),
    `quil-retire-${process.hrtime.bigint()}.sqlite`,
  );
  await initDb(dbFile);
  const m = await migrateDb(dbFile);
  await m.close();
});

afterEach(async () => {
  await closeDb();
  for (const suffix of ["", "-wal", "-shm"]) {
    try {
      fs.unlinkSync(dbFile + suffix);
    } catch {
      /* ignore */
    }
  }
});

describe("retireCharacter (SEC-1, DATA-2)", () => {
  it("retires the active char, transfers CC, and promotes the next", async () => {
    await seedChar("u1", "Aragorn", 1, 10);
    await seedChar("u1", "Boromir", 0, 5);

    const res = await retireCharacter("u1"); // active = Aragorn
    expect(res).not.toBeNull();
    expect(res!.row.name).toBe("Aragorn");
    expect(res!.lastChar).toBe(false);

    expect(await getPlayer("u1", "Aragorn")).toBeUndefined();
    const boromir = await getPlayer("u1", "Boromir");
    expect(boromir!.cc).toBe(15); // 5 + 10 transferred
    expect(boromir!.active).toBeTruthy();
  });

  it("flags the last character", async () => {
    await seedChar("u2", "Solo", 1, 3);
    const res = await retireCharacter("u2");
    expect(res!.lastChar).toBe(true);
    expect(await getPlayer("u2", "Solo")).toBeUndefined();
  });

  it("does NOT delete other rows for an injection-style name (SEC-1)", async () => {
    await seedChar("u3", "Legit", 1, 0);
    const res = await retireCharacter("u3", "x' OR '1'='1");
    expect(res).toBeNull(); // no matching character
    expect(await getPlayer("u3", "Legit")).toBeDefined(); // survivor intact
  });
});

describe("setActive (BUG-4)", () => {
  it("returns false for an unknown character (no false success)", async () => {
    await seedChar("u4", "A", 1);
    expect(await setActive("u4", "Nope")).toBe(false);
    expect((await getPlayer("u4", "A"))!.active).toBeTruthy();
  });

  it("switches the active character", async () => {
    await seedChar("u5", "A", 1);
    await seedChar("u5", "B", 0);
    expect(await setActive("u5", "B")).toBe(true);
    expect((await getPlayer("u5", "B"))!.active).toBeTruthy();
    expect((await getPlayer("u5", "A"))!.active).toBeFalsy();
  });
});
