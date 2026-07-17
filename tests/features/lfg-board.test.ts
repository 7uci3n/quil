import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { Sqlite } from "../../src/db/index.js";
import { createTestDb, cleanupTestDb } from "../fixtures/test-db.js";
import {
  makeInteraction,
  makeGuild,
  makeChannel,
} from "../fixtures/mock-interactions.js";
import { upsertLfgEntry } from "../../src/db/lfg.js";
import { getGuildState, setGuildState } from "../../src/domain/guildState.js";
import { refreshBoard } from "../../src/features/lfg/board.js";
import { CONFIG } from "../../src/config/resolved.js";

const GUILD_ID = CONFIG.guild!.id;
const BOARD_CHAN = CONFIG.guild!.config.features!.lfg!.channels!.board;
const BOARD_KEY = "lfg_board_message_id";

describe("refreshBoard (real DB)", () => {
  let db: Sqlite;
  beforeEach(async () => {
    db = await createTestDb();
  });
  afterEach(async () => {
    await cleanupTestDb(db);
  });

  it("does nothing outside a guild", async () => {
    const { ix } = makeInteraction({ guild: null });
    await expect(refreshBoard(ix)).resolves.toBeUndefined();
  });

  it("posts a new board message and stores its id when none exists", async () => {
    await upsertLfgEntry({
      userId: "x",
      guildId: GUILD_ID,
      name: "x",
      startedAt: Date.now(),
      low: 1,
      mid: 0,
      high: 0,
      epic: 0,
      pbp: 0,
      updatedAt: Date.now(),
    });
    const channel = makeChannel(BOARD_CHAN, {
      send: vi.fn(async () => ({ id: "new-msg-id" })),
    });
    const guild = makeGuild({ id: GUILD_ID, channels: [channel] });
    const { ix } = makeInteraction({ guild, guildId: GUILD_ID });
    await refreshBoard(ix, "test");
    expect(channel.send).toHaveBeenCalledTimes(1);
    expect(await getGuildState(GUILD_ID, BOARD_KEY)).toBe("new-msg-id");
  });

  it("edits the existing sticky message when an id is stored", async () => {
    await setGuildState(GUILD_ID, BOARD_KEY, "existing-id");
    const edit = vi.fn(async () => undefined);
    const channel = makeChannel(BOARD_CHAN, {
      messages: { fetch: vi.fn(async () => ({ edit })) },
    });
    const guild = makeGuild({ id: GUILD_ID, channels: [channel] });
    const { ix } = makeInteraction({ guild, guildId: GUILD_ID });
    await refreshBoard(ix);
    expect(edit).toHaveBeenCalledTimes(1);
    expect(channel.send).not.toHaveBeenCalled();
  });

  it("falls back to sending when the stored message can't be fetched", async () => {
    await setGuildState(GUILD_ID, BOARD_KEY, "stale-id");
    const channel = makeChannel(BOARD_CHAN, {
      messages: {
        fetch: vi.fn(async () => {
          throw new Error("unknown message");
        }),
      },
      send: vi.fn(async () => ({ id: "fresh-id" })),
    });
    const guild = makeGuild({ id: GUILD_ID, channels: [channel] });
    const { ix } = makeInteraction({ guild, guildId: GUILD_ID });
    await refreshBoard(ix);
    expect(channel.send).toHaveBeenCalledTimes(1);
    expect(await getGuildState(GUILD_ID, BOARD_KEY)).toBe("fresh-id");
  });
});
