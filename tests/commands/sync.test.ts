import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { Sqlite } from "../../src/db/index.js";
import { createTestDb, cleanupTestDb } from "../fixtures/test-db.js";
import { makeInteraction } from "../fixtures/mock-interactions.js";
import { getDb } from "../../src/db/index.js";
import { StoryCache } from "../../src/utils/db_queries.js";

vi.mock("../../src/utils/gsheet.js", () => ({
  fetchStoriesFromGoogleSheet: vi.fn(async () => [
    { title: "Alpha", genre: "Myth", content: "aaa", author: "Quil" },
    { title: "Beta", genre: "Myth", content: "bbb" },
  ]),
}));

import * as sync from "../../src/commands/sync.js";

describe("/sync (real DB, mocked sheet)", () => {
  let db: Sqlite;
  beforeEach(async () => {
    db = await createTestDb();
  });
  afterEach(async () => {
    await cleanupTestDb(db);
  });

  it("replaces the library table and refreshes the story cache", async () => {
    // pre-existing row that must be cleared by the atomic replace
    getDb()
      .prepare(
        `INSERT INTO library (title, genre, content, author) VALUES ('Old','X','y',NULL)`,
      )
      .run();

    const { ix, deferReply, editReply } = makeInteraction({});
    await sync.execute(ix);

    expect(deferReply).toHaveBeenCalled();
    expect(editReply).toHaveBeenCalled();

    const rows = getDb().prepare(`SELECT title FROM library`).all() as {
      title: string;
    }[];
    expect(rows.map((r) => r.title).sort()).toEqual(["Alpha", "Beta"]);
    expect(StoryCache.allTitles).toContain("Alpha");
  });
});
