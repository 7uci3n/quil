import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { Sqlite } from "../../src/db/index.js";
import { createTestDb, cleanupTestDb } from "../fixtures/test-db.js";
import { makeInteraction, makeUser } from "../fixtures/mock-interactions.js";
import { getDb } from "../../src/db/index.js";
import { loadStoryCacheFromDB } from "../../src/utils/db_queries.js";
import * as library from "../../src/commands/library.js";

/** A fake message-component collector that records its handlers so tests can
 *  fire button presses and the end event synchronously. */
function fakeCollector() {
  const handlers: Record<string, (arg?: unknown) => Promise<void> | void> = {};
  return {
    on: (event: string, fn: (arg?: unknown) => Promise<void> | void) => {
      handlers[event] = fn;
    },
    fire: (event: string, arg?: unknown) => handlers[event]?.(arg),
  };
}

function fakeButton(customId: string, userId: string) {
  return {
    customId,
    user: { id: userId },
    reply: vi.fn(async () => undefined),
    update: vi.fn(async () => undefined),
  };
}

async function seedStory(title: string, content: string, genre = "Myth") {
  getDb()
    .prepare(
      `INSERT INTO library (title, genre, content, author) VALUES (?, ?, ?, NULL)`,
    )
    .run(title, genre, content);
  await loadStoryCacheFromDB();
}

describe("/library execute", () => {
  let db: Sqlite;
  beforeEach(async () => {
    db = await createTestDb();
  });
  afterEach(async () => {
    await cleanupTestDb(db);
  });

  it("replies ephemerally when no story matches", async () => {
    const { ix, reply } = makeInteraction({
      options: { title: "Nonexistent" },
    });
    await library.execute(ix);
    const arg = reply.mock.calls[0]![0] as { flags: number };
    expect(arg.flags).toBeDefined();
  });

  it("renders a single-page story without controls", async () => {
    await seedStory("Short", "just a little tale");
    const { ix, reply } = makeInteraction({
      options: { title: "Short" },
      replyResult: { resource: undefined },
    });
    await library.execute(ix);
    const arg = reply.mock.calls[0]![0] as {
      embeds: unknown[];
      components: unknown[];
    };
    expect(arg.embeds.length).toBe(1);
    expect(arg.components).toEqual([]);
  });

  it("paginates a long story and wires up the collector", async () => {
    await seedStory("Epic", "x".repeat(8000));
    const collector = fakeCollector();
    const message = {
      createMessageComponentCollector: vi.fn(() => collector),
      edit: vi.fn(async () => undefined),
    };
    const owner = makeUser({ id: "owner" });
    const { ix, reply } = makeInteraction({
      user: owner,
      options: { title: "Epic" },
      replyResult: { resource: { message } },
    });
    await library.execute(ix);
    const arg = reply.mock.calls[0]![0] as { components: unknown[] };
    expect(arg.components.length).toBe(1);

    // owner turns the page → i.update called
    const next = fakeButton("next", "owner");
    await collector.fire("collect", next);
    expect(next.update).toHaveBeenCalled();

    // non-owner tries to lock → denied with an ephemeral reply
    const stranger = fakeButton("lock", "intruder");
    await collector.fire("collect", stranger);
    expect(stranger.reply).toHaveBeenCalled();

    // owner locks, then a stranger's page-turn is denied
    const ownerLock = fakeButton("lock", "owner");
    await collector.fire("collect", ownerLock);
    const strangerTurn = fakeButton("prev", "intruder");
    await collector.fire("collect", strangerTurn);
    expect(strangerTurn.reply).toHaveBeenCalled();

    // end disables the buttons
    await collector.fire("end");
    expect(message.edit).toHaveBeenCalled();
  });
});
