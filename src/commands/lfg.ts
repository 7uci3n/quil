// src/commands/lfg.ts
import { SlashCommandBuilder, ChatInputCommandInteraction } from "discord.js";
import {
  handleToggle,
  handleAdd,
  handleRemove,
  handleStatus,
  handleList,
  handlePurge,
} from "../features/lfg/handlers.js";

export const data = new SlashCommandBuilder()
  .setName("lfg")
  .setDescription("Looking-For-Group controls (roles + board)")
  // toggle
  .addSubcommand((sc) =>
    sc
      .setName("toggle")
      .setDescription("Toggle LFG for a tier (auto=from level).")
      .addStringOption((o) =>
        o
          .setName("tier")
          .setDescription("Tier to toggle")
          .addChoices(
            { name: "Auto (from level)", value: "auto" },
            { name: "Low (2–4)", value: "low" },
            { name: "Mid (5–10)", value: "mid" },
            { name: "High (11–16)", value: "high" },
            { name: "Epic (17+)", value: "epic" },
            { name: "Play-by-Post", value: "pbp" },
          ),
      ),
  )
  // add
  .addSubcommand((sc) =>
    sc
      .setName("add")
      .setDescription("Add LFG for a tier (auto=from level).")
      .addStringOption((o) =>
        o
          .setName("tier")
          .setDescription("Tier to add")
          .addChoices(
            { name: "Auto (from level)", value: "auto" },
            { name: "Low (2–4)", value: "low" },
            { name: "Mid (5–10)", value: "mid" },
            { name: "High (11–16)", value: "high" },
            { name: "Epic (17+)", value: "epic" },
            { name: "Play-by-Post", value: "pbp" },
          ),
      ),
  )
  // remove
  .addSubcommand((sc) =>
    sc
      .setName("remove")
      .setDescription("Remove LFG for a tier, or remove all.")
      .addStringOption((o) =>
        o
          .setName("tier")
          .setDescription("Tier to remove (or 'all')")
          .addChoices(
            { name: "All tiers", value: "all" },
            { name: "Low (2–4)", value: "low" },
            { name: "Mid (5–10)", value: "mid" },
            { name: "High (11–16)", value: "high" },
            { name: "Epic (17+)", value: "epic" },
            { name: "Play-by-Post", value: "pbp" },
          )
          .setRequired(true),
      ),
  )
  // status
  .addSubcommand((sc) =>
    sc.setName("status").setDescription("Show your LFG status and wait time."),
  )
  // list
  .addSubcommand((sc) =>
    sc
      .setName("list")
      .setDescription(
        "Preview the LFG board; optionally post/update the sticky board.",
      )
      .addBooleanOption((o) =>
        o
          .setName("post")
          .setDescription("Post/update the sticky board (mods/admins)"),
      ),
  )
  // purge
  .addSubcommand((sc) =>
    sc
      .setName("purge")
      .setDescription("Remove LFG entries older than N days (mods/admins).")
      .addIntegerOption((o) =>
        o
          .setName("days")
          .setDescription("Age in days")
          .setRequired(true)
          .setMinValue(1),
      )
      .addStringOption((o) =>
        o
          .setName("scope")
          .setDescription("Which entries to purge")
          .addChoices(
            { name: "All", value: "all" },
            { name: "Only Play-by-Post", value: "pbp" },
          ),
      ),
  );

export async function execute(ix: ChatInputCommandInteraction) {
  const sub = ix.options.getSubcommand() as
    "toggle" | "add" | "remove" | "status" | "list" | "purge";
  if (sub === "toggle") return handleToggle(ix);
  if (sub === "add") return handleAdd(ix);
  if (sub === "remove") return handleRemove(ix);
  if (sub === "status") return handleStatus(ix);
  if (sub === "list") return handleList(ix);
  if (sub === "purge") return handlePurge(ix);
}

export default { data, execute };
