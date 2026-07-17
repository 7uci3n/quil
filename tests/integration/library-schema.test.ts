import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { Sqlite } from "../../src/db/index.js";
import { createTestDb, cleanupTestDb } from "../fixtures/test-db.js";

describe("library table schema (author column)", () => {
  let db: Sqlite;

  beforeEach(async () => {
    db = await createTestDb();
  });
  afterEach(async () => {
    await cleanupTestDb(db);
  });

  it("has an author column after migration", () => {
    const cols = db
      .prepare(`SELECT name FROM pragma_table_info('library')`)
      .all() as { name: string }[];
    expect(cols.map((c) => c.name)).toContain("author");
  });

  it("stores and reads back the author", () => {
    db.prepare(
      `INSERT INTO library (title, genre, content, author) VALUES (?, ?, ?, ?)`,
    ).run("The Ledger", "Mystery", "body", "Quil");
    const row = db
      .prepare(`SELECT author FROM library WHERE title = ?`)
      .get("The Ledger") as { author: string };
    expect(row.author).toBe("Quil");
  });
});
