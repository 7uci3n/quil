// Local dev-config override EXAMPLE (ADR-0008).
//
// Copy this file to `app.config.dev.ts` (git-ignored) and fill in the ids for
// YOUR test guild. Only the fields you set are overridden; everything else falls
// back to DEFAULT_CONFIG. The override is loaded only when NODE_ENV is not
// "production", so it can never affect a prod host.
//
//   cp src/config/app.config.dev.example.ts src/config/app.config.dev.ts
//
import type { DevConfig } from "./app.config.js";

export const DEV_CONFIG: DevConfig = {
  guild: {
    id: "YOUR_DEV_GUILD_ID",
    config: {
      roles: {
        member: { id: "YOUR_DEV_CREW_ROLE_ID" },
        admin: { id: "YOUR_DEV_ADMIN_ROLE_ID" },
        moderator: { id: "YOUR_DEV_MOD_ROLE_ID" },
        keeper: { id: "YOUR_DEV_KEEPER_ROLE_ID" },
        dm: { id: "YOUR_DEV_DM_ROLE_ID" },
      },
      channels: {
        // Only override the channels you actually use while developing.
        resourceTracking: "YOUR_DEV_RESOURCE_CHANNEL_ID",
      },
    },
  },
};
