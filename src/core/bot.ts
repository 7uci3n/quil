// core/bot.ts
import { log } from "../lib/log.js";
import {
  Client,
  GatewayIntentBits,
  Events,
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  MessageFlags,
  type RepliableInteraction,
} from "discord.js";

import * as fsSync from "node:fs";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";

import { CONFIG } from "../config/resolved.js";
import { initDb, closeDb } from "../db/index.js";

import * as retire from "../commands/retire.js";
import { t } from "../lib/i18n.js";
import {
  loadCharCacheFromDB,
  loadStoryCacheFromDB,
} from "../utils/db_queries.js";
import { autocomplete } from "../utils/autocomplete.js";

// figure out if we're executing from dist or src

// commmand-registry
type CommandModule = {
  data?: SlashCommandBuilder;
  execute?: (i: ChatInputCommandInteraction) => Promise<void>;
};

const commands = new Map<string, CommandModule>();

// Single place for ephemeral error replies (followUp if already responded).
async function safeReplyError(
  interaction: RepliableInteraction,
  content: string,
) {
  if (interaction.deferred || interaction.replied) {
    await interaction.followUp({ content, flags: MessageFlags.Ephemeral });
  } else {
    await interaction.reply({ content, flags: MessageFlags.Ephemeral });
  }
}

// dynamically load commands from the commands directory
async function loadCommands() {
  // determine if we're running from src/ or dist/
  const here = fileURLToPath(new URL(".", import.meta.url));
  const isBuilt = here.includes(`${path.sep}dist${path.sep}`);
  const commandsDir = path.resolve(here, "../commands");
  const ext = isBuilt ? ".js" : ".ts";

  log.info(`Loading commands from ${commandsDir} (built=${isBuilt})`);

  const files = fsSync
    .readdirSync(commandsDir)
    .filter(
      (f) => f.endsWith(ext) && !f.endsWith(".d.ts") && !f.endsWith(".map"),
    );

  log.info(
    `Command files found (${ext}):`,
    files.map((f) => path.join(commandsDir, f)),
  );

  for (const f of files) {
    try {
      const full = path.join(commandsDir, f); // ✅ join directory + filename
      const mod: CommandModule = await import(pathToFileURL(full).href);
      if (!mod?.data?.name) {
        log.warn(`⚠️  Skipping ${full}: no export 'data' with a name`);
        continue;
      }
      const cmdJSON = mod.data.toJSON();
      if (isDevelopment) {
        // Modify the name dynamically
        cmdJSON.name = `dev_${cmdJSON.name}`;
      }
      commands.set(cmdJSON.name, mod);
    } catch (err) {
      log.error(`❌ Failed to import ${f}:`, err);
    }
  }
  log.info(`Loaded ${commands.size} slash commands.`);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
  ],
});

const guildId = CONFIG.guild!.id;
const guildCfg = CONFIG.guild!.config;

if (!guildCfg) {
  throw new Error(
    `[config] GuildId "${guildId}" not found. Please set up your guild ID in config in src/config/app.config.ts`,
  );
}

client.on(Events.InteractionCreate, async (interaction) => {
  // slash command handler
  if (interaction.isChatInputCommand()) {
    const mod = commands.get(interaction.commandName);
    if (!mod?.execute) {
      // should never happen
      await safeReplyError(
        interaction,
        t("errors.generic") || "Command not found.",
      );
      return;
    }
    try {
      await mod.execute(interaction);
    } catch (err) {
      log.error(`[/${interaction.commandName}]`, err);
      await safeReplyError(
        interaction,
        t("errors.generic") || "An error occurred while executing the command.",
      );
    }
    return;
  }

  if (interaction.isAutocomplete()) {
    return autocomplete(interaction);
  }

  if (interaction.isModalSubmit()) {
    //dynamically dispatch if you add more modals later.
    if (interaction.customId.startsWith("retire-confirm-")) {
      try {
        await retire.handleModal(interaction);
      } catch (err) {
        log.error("[Retire Modal]", err);
        await safeReplyError(
          interaction,
          t("errors.generic") ||
            "An error occurred while processing the modal.",
        );
      }
    }
  }
});

client.once(Events.ClientReady, async () => {
  await loadCommands();
  await initDb();
  await loadCharCacheFromDB();
  await loadStoryCacheFromDB();
  log.info(
    `Ready as ${client.user?.tag}. Guild: ${guildId} (${guildCfg.name})`,
  );
});
const DEV_TOKEN = CONFIG.secrets.devToken;
const isDevelopment = process.argv.includes("--dev");

if (isDevelopment) {
  log.info("🚀 Starting in development mode...");
  client.login(DEV_TOKEN).catch(() => {
    log.error(
      "❌ Failed to login to Discord. Please check your DEV_DISCORD_TOKEN.",
    );
    process.exit(1);
  });
} else {
  log.info("🚀 Starting in production mode...");
  client.login(CONFIG.secrets.token).catch(() => {
    log.error(
      "❌ Failed to login to Discord. Please check your DISCORD_TOKEN.",
    );
    process.exit(1);
  });
}

// graceful shutdown — SIGINT (Ctrl-C) and SIGTERM (docker/systemd stop)
let shuttingDown = false;
async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  log.info(`Received ${signal}, shutting down...`);
  try {
    await client.destroy();
  } catch (e) {
    log.error("Error destroying client:", e);
  }
  try {
    await closeDb();
  } catch (e) {
    log.error("Error closing DB:", e);
  }
  process.exit(0);
}
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

// on unhandled rejections
process.on("unhandledRejection", (reason, promise) => {
  log.error("Unhandled Rejection at:", promise, "reason:", reason);
});

// on uncaught exceptions
process.on("uncaughtException", (err) => {
  log.error("Uncaught Exception thrown:", err);
  process.exit(1);
});

// on warnings
process.on("warning", (warning) => {
  log.warn("Warning:", warning);
});
