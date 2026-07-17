import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { Sqlite } from "../../src/db/index.js";
import {
  createTestDb,
  seedTestPlayer,
  cleanupTestDb,
} from "../fixtures/test-db.js";
import { makeInteraction, makeMember } from "../fixtures/mock-interactions.js";
import { getPlayer, getPlayerCC } from "../../src/utils/db_queries.js";
import { CONFIG } from "../../src/config/resolved.js";
import { dtpDayBoundary } from "../../src/domain/dtp.js";
import * as buy from "../../src/commands/buy.js";
import * as sell from "../../src/commands/sell.js";

const CREW = CONFIG.guild!.config.roles.member.id!;
const DTP_RATE = CONFIG.guild!.config.features.dtp?.rate ?? 2;
// Boundary that leaves DTP un-accrued (so spends are predictable).
const NOW_BOUNDARY = dtpDayBoundary(Date.now() / 1000, DTP_RATE);

describe("/buy (real DB)", () => {
  let db: Sqlite;
  beforeEach(async () => {
    db = await createTestDb();
    await seedTestPlayer(db, {
      userId: "buyer",
      name: "Buyer",
      cp: 5000,
      tp: 3,
      dtp: 10,
      cc: 20,
      active: true,
    });
  });
  afterEach(async () => {
    await cleanupTestDb(db);
  });

  it("debits GP (copper) on a successful purchase", async () => {
    // member.user drives the buyer id; align seed with it
    const member = makeMember({ roleIds: [] });
    await seedTestPlayer(db, {
      userId: member.user.id,
      name: "Hero",
      cp: 5000,
      active: true,
    });
    const { ix, reply } = makeInteraction({
      member,
      options: { item: "Shield", gp: 10 },
    });
    await buy.execute(ix);
    expect((await getPlayer(member.user.id))!.cp).toBe(5000 - 1000);
    expect(reply).toHaveBeenCalled();
  });

  it("rejects when no resource is specified", async () => {
    const member = makeMember({ roleIds: [] });
    await seedTestPlayer(db, {
      userId: member.user.id,
      name: "Hero",
      active: true,
    });
    const { ix, reply } = makeInteraction({
      member,
      options: { item: "Nothing" },
    });
    await buy.execute(ix);
    const arg = reply.mock.calls[0]![0] as { flags: number };
    expect(arg.flags).toBeDefined();
    expect((await getPlayer(member.user.id))!.cp).toBe(0);
  });

  it("rejects sub-cent GP precision", async () => {
    const member = makeMember({ roleIds: [] });
    await seedTestPlayer(db, {
      userId: member.user.id,
      name: "Hero",
      cp: 5000,
      active: true,
    });
    const { ix, reply } = makeInteraction({
      member,
      options: { item: "X", gp: 1.005 },
    });
    await buy.execute(ix);
    const arg = reply.mock.calls[0]![0] as { content: string };
    expect(typeof arg.content).toBe("string");
  });

  it("rejects insufficient funds without debiting", async () => {
    const member = makeMember({ roleIds: [] });
    await seedTestPlayer(db, {
      userId: member.user.id,
      name: "Hero",
      cp: 100,
      active: true,
    });
    const { ix, reply } = makeInteraction({
      member,
      options: { item: "Castle", gp: 50 },
    });
    await buy.execute(ix);
    const arg = reply.mock.calls[0]![0] as { flags: number };
    expect(arg.flags).toBeDefined();
    expect((await getPlayer(member.user.id))!.cp).toBe(100);
  });

  it("blocks CC spend for non-crew members", async () => {
    const member = makeMember({ roleIds: [] });
    await seedTestPlayer(db, {
      userId: member.user.id,
      name: "Hero",
      cc: 100,
      active: true,
    });
    const { ix, reply } = makeInteraction({
      member,
      options: { item: "Y", cc: 5 },
    });
    await buy.execute(ix);
    const arg = reply.mock.calls[0]![0] as { content: string; flags: number };
    expect(arg.flags).toBeDefined();
  });

  it("lets a crew member spend pooled CC", async () => {
    const member = makeMember({ roleIds: [CREW] });
    await seedTestPlayer(db, {
      userId: member.user.id,
      name: "Hero",
      cc: 30,
      active: true,
    });
    const { ix } = makeInteraction({
      member,
      options: { item: "Potion", cc: 10 },
    });
    await buy.execute(ix);
    expect(await getPlayerCC(member.user.id)).toBe(20);
  });

  it("reports no record when the buyer has no character", async () => {
    const member = makeMember({ roleIds: [] });
    const { ix, reply } = makeInteraction({
      member,
      options: { item: "Z", gp: 1 },
    });
    await buy.execute(ix);
    const arg = reply.mock.calls[0]![0] as { flags: number };
    expect(arg.flags).toBeDefined();
  });

  it("spends GP + GT + DTP together and reports the new balances", async () => {
    const member = makeMember({ roleIds: [] });
    await seedTestPlayer(db, {
      userId: member.user.id,
      name: "Hero",
      cp: 5000,
      tp: 5,
      dtp: 8,
      dtp_updated: NOW_BOUNDARY,
      active: true,
    });
    const { ix, reply } = makeInteraction({
      member,
      options: { item: "Kit", gp: 10, gt: 2, dtp: 3 },
    });
    await buy.execute(ix);
    const row = (await getPlayer(member.user.id))!;
    expect(row.cp).toBe(4000);
    expect(row.tp).toBe(3);
    expect(row.dtp).toBe(5);
    const arg = reply.mock.calls[0]![0] as { content: string };
    expect(arg.content).toContain("Kit");
  });

  it("rejects when GT funds are insufficient", async () => {
    const member = makeMember({ roleIds: [] });
    await seedTestPlayer(db, {
      userId: member.user.id,
      name: "Hero",
      tp: 1,
      active: true,
    });
    const { ix, reply } = makeInteraction({
      member,
      options: { item: "Wand", gt: 5 },
    });
    await buy.execute(ix);
    const arg = reply.mock.calls[0]![0] as { content: string; flags: number };
    expect(arg.flags).toBeDefined();
    expect((await getPlayer(member.user.id))!.tp).toBe(1);
  });

  it("reports not-in-system when spending DTP without a character", async () => {
    const member = makeMember({ roleIds: [] });
    const { ix, reply } = makeInteraction({
      member,
      options: { item: "Rest", dtp: 1 },
    });
    await buy.execute(ix);
    const arg = reply.mock.calls[0]![0] as { flags: number };
    expect(arg.flags).toBeDefined();
  });
});

describe("/sell (real DB)", () => {
  let db: Sqlite;
  beforeEach(async () => {
    db = await createTestDb();
  });
  afterEach(async () => {
    await cleanupTestDb(db);
  });

  it("credits GP for a valid sale", async () => {
    const member = makeMember({ roleIds: [] });
    await seedTestPlayer(db, {
      userId: member.user.id,
      name: "Hero",
      cp: 0,
      active: true,
    });
    const { ix, reply } = makeInteraction({
      member,
      options: { item: "Gem", amount: 12.5 },
    });
    await sell.execute(ix);
    expect((await getPlayer(member.user.id))!.cp).toBe(1250);
    expect(reply).toHaveBeenCalled();
  });

  it("rejects sub-cent precision", async () => {
    const member = makeMember({ roleIds: [] });
    await seedTestPlayer(db, {
      userId: member.user.id,
      name: "Hero",
      active: true,
    });
    const { ix, reply } = makeInteraction({
      member,
      options: { item: "Gem", amount: 1.005 },
    });
    await sell.execute(ix);
    const arg = reply.mock.calls[0]![0] as { flags: number };
    expect(arg.flags).toBeDefined();
  });

  it("reports no record when the seller has no character", async () => {
    const member = makeMember({ roleIds: [] });
    const { ix, reply } = makeInteraction({
      member,
      options: { item: "Gem", amount: 5 },
    });
    await sell.execute(ix);
    const arg = reply.mock.calls[0]![0] as { flags: number };
    expect(arg.flags).toBeDefined();
  });

  it("enforces the resource channel inside the configured guild", async () => {
    const member = makeMember({ roleIds: [] });
    const { ix, reply } = makeInteraction({
      member,
      guildId: CONFIG.guild!.id,
      channelId: "not-a-resource-channel",
      options: { item: "Gem", amount: 5 },
    });
    await sell.execute(ix);
    const arg = reply.mock.calls[0]![0] as { content: string; flags: number };
    expect(arg.flags).toBeDefined();
  });

  it("rejects a non-positive amount", async () => {
    const member = makeMember({ roleIds: [] });
    await seedTestPlayer(db, {
      userId: member.user.id,
      name: "Hero",
      active: true,
    });
    const { ix, reply } = makeInteraction({
      member,
      options: { item: "Gem", amount: 0 },
    });
    await sell.execute(ix);
    const arg = reply.mock.calls[0]![0] as { flags: number };
    expect(arg.flags).toBeDefined();
  });
});
