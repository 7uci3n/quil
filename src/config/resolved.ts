import "dotenv/config";
import { DEFAULT_CONFIG } from "./app.config.js";
import type { DevConfig } from "./app.config.js";
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
});

const env = Env.parse(process.env);

// Recursively merge src into a deep clone of target.
// Arrays and non-plain-object values in src replace (not merge into) target.
function deepMerge<T>(target: T, src: unknown): T {
  if (src === null || src === undefined || typeof src !== "object" || Array.isArray(src)) {
    return (src === undefined ? target : src) as T;
  }
  const result = { ...target } as Record<string, unknown>;
  for (const key of Object.keys(src as object)) {
    const s = (src as Record<string, unknown>)[key];
    const t = result[key];
    result[key] =
      t !== null && typeof t === "object" && !Array.isArray(t) &&
      s !== null && typeof s === "object" && !Array.isArray(s)
        ? deepMerge(t, s)
        : s;
  }
  return result as T;
}

// Load optional dev config override (gitignored, local only).
// Only applied when env is not "prod".
let devOverride: DevConfig = {};
if (DEFAULT_CONFIG.env !== "prod") {
  try {
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-expect-error — file is gitignored and may not exist; the catch handles absence
    const mod = await import("./app.config.dev.js");
    devOverride = mod.DEV_CONFIG ?? {};
    console.log("[Config] Dev config override loaded.");
  } catch {
    // File doesn't exist — silently skip.
  }
}

const mergedConfig = deepMerge(DEFAULT_CONFIG, devOverride);

export const CONFIG = {
  ...mergedConfig,
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
} as const;
