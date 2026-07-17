import "dotenv/config";
import { DEFAULT_CONFIG } from "./app.config.js";
import { z } from "zod";

const Env = z.object({
  DISCORD_TOKEN: z.string().min(1, { message: "DISCORD_TOKEN is required" }),
  DB_FILE: z.string().default("./data/remnant.sqlite"),
  GUILD_FUND_ID: z.string().default("sys:fund:remnant"),
  GUILD_ID: z.string().min(1, { message: "GUILD_ID is required" }),
  APP_ID: z.string().min(1, { message: "APP_ID is required" }),
  DEV_GUILD_ID: z.string().optional(),
  DEV_DISCORD_TOKEN: z.string().optional(),
  DEV_APP_ID: z.string().optional(),
  NODE_ENV: z.string().optional(),
  // Permission-bypass controls — validated here rather than read ad-hoc.
  SUPERUSER_IDS: z.string().optional(),
  TEST_GUILD_IDS: z.string().optional(),
  // Google Sheet backing the /library command (public CSV export).
  LIBRARY_SHEET_ID: z
    .string()
    .default("1gIqy0R-jj3OdH3rtfSqjwrt5COdfRN-_pTVyVQOwsnI"),
});

const env = Env.parse(process.env);

/** Map NODE_ENV to the bot's coarse environment flag. */
export function deriveEnv(nodeEnv?: string): "prod" | "dev" {
  return nodeEnv === "production" ? "prod" : "dev";
}

/** Parse a comma-separated env value into a trimmed, non-empty list. */
export function parseCsv(value?: string): string[] {
  return (value ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export const CONFIG = {
  ...DEFAULT_CONFIG,
  env: deriveEnv(env.NODE_ENV),
  secrets: {
    token: env.DISCORD_TOKEN,
    devToken: env.DEV_DISCORD_TOKEN,
  },
  db: {
    file: env.DB_FILE,
  },
  system: {
    guildId: env.GUILD_ID,
    appId: env.APP_ID,
    fundId: env.GUILD_FUND_ID,
    devGuildId: env.DEV_GUILD_ID,
    devAppId: env.DEV_APP_ID,
  },
  security: {
    superuserIds: parseCsv(env.SUPERUSER_IDS),
    testGuildIds: parseCsv(env.TEST_GUILD_IDS),
  },
  library: {
    sheetId: env.LIBRARY_SHEET_ID,
  },
} as const;
