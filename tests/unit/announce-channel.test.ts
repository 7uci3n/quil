import { describe, it, expect, vi } from "vitest";
import {
  makeInteraction,
  makeGuild,
  makeChannel,
} from "../fixtures/mock-interactions.js";
import { announceLevelChange } from "../../src/utils/announce.js";
import { CONFIG } from "../../src/config/resolved.js";

const REWARDS = CONFIG.guild!.config.channels!.resourceTracking!;

describe("announceLevelChange", () => {
  it("posts to the rewards channel when the guild has it cached", async () => {
    const channel = makeChannel(REWARDS);
    const guild = makeGuild({ channels: [channel] });
    const { ix } = makeInteraction({ guild });
    await announceLevelChange(ix, "u1", "Hero", 5, +1);
    expect(channel.send).toHaveBeenCalledTimes(1);
    expect(String(channel.send.mock.calls[0]![0])).toContain("Hero");
  });

  it("falls back to the invoking channel when no guild is present", async () => {
    const send = vi.fn(async () => undefined);
    const { ix } = makeInteraction({ guild: null, channel: { send } });
    await announceLevelChange(ix, "u1", "Hero", 3, -1);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("does not throw when there is no channel to post to", async () => {
    const { ix } = makeInteraction({ guild: null, channel: null });
    await expect(
      announceLevelChange(ix, "u1", "Hero", 2, +1),
    ).resolves.toBeUndefined();
  });
});
