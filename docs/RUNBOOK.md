# Quil Runbook

Operational notes and developer guide for working on the bot.

---

## ⚙️ Prerequisites

- Node.js LTS (v20+ recommended)
- npm v9+
- Discord application with bot token

---

## 🛠️ Setup

1. Clone repo
2. Install dependencies:

   ```bash
   npm install
   ```

3. Copy `.env.example` to `.env` and inspect `src/config/app.config.ts` for guild defaults.
   - There is no `app.config.example.ts` file in this repo — `src/config/app.config.ts` is the canonical default. If you want to change defaults, edit `src/config/app.config.ts` locally (or create a local override and keep it out of VCS).
4. Fill in the required secrets in `.env` (Discord bot token, APP_ID, GUILD_ID as applicable).
5. Configure `app.config.ts` (guild IDs, roles, prefixes, level curve) only when you understand the mapping.
   - Note: `src/config/app.config.ts` contains the default structure. `src/config/resolved.ts` reads `.env` values and merges them into runtime `CONFIG`.
6. (Optional) Install `pm2` or set up a `systemd` service for process management.

---

## ▶️ Running Locally

```bash
# Build once (Production mode)
npm run build

# Start the bot (Production mode, runs compiled JS)
npm start

# Start the bot in development mode (with hot reload)
npm run dev
```

Expected output:

```bash
"Logged in as Quil#1234" in Console
```

## 🛠️ Release & Deploy

1. Ensure all changes are committed and pushed to main.
2. Tag a new release in Git (e.g., `v0.1.0`).
3. Install dependencies:

   ```bash
   git pull origin main
   ```

4. Install any new dependencies:

   ```bash
   npm install
   # or
   npm ci
   ```

5. Build the project:

   ```bash
   npm run build
   ```

6. Restart the bot process:

   ```bash
   pm2 restart quil
   # or
   systemctl restart quil
   ```

---

## 🔑 Secrets

- `.env` is **not committed**.
- Example:

  ```bash
  DISCORD_TOKEN=your-bot-token-here
  ```

---

## 🔄 Common Commands

- `npm run dev` — start development bot
- `npm run lint` — lint with ESLint
- `npm run format` — format with Prettier
- `npm run build` — compile TypeScript
- `npm start` — start production bot
- `npm prestart` — build before starting in production mode

---

## 📢 Registering slash commands

Slash commands must be uploaded to Discord so they appear in your guild. This repo includes a registrar script at `src/scripts/register-commands.ts` which:

- Dynamically imports `src/commands/*.ts` and posts their JSON to Discord REST.
- Respects `DEV_GUILD_ID` for dev guild rapid testing and requires `GUILD_ID`/`--prod` for production deploys.

Examples:

```bash
# register to the development guild (set DEV_GUILD_ID in .env)
npm run deploy:dev

# register to the production guild (requires GUILD_ID and APP_ID in .env)
npm run deploy:prod -- --prod

# list global commands (requires APP_ID)
npm run deploy:list

# clear all global commands (use with caution)
npm run deploy:clear:global
```

Notes:

- The registrar will refuse to run a global deploy unless a GUILD_ID is present (safety guard).
- If you change options or command signatures, re-run the appropriate deploy command.

Registrar safety checklist (brief)

- Ensure `.env` contains `DISCORD_TOKEN` and `APP_ID`.
- For dev uploads: set `DEV_GUILD_ID` in `.env` and run `npm run deploy:dev` (deploys only to the dev guild).
- For production uploads: set `GUILD_ID` and run `npm run deploy:prod -- --prod` (registrar will require `GUILD_ID` for global/production operations).
- Avoid running a global clear unless intentional (`npm run deploy:clear:global`). The registrar will refuse to execute unsafe global pushes without a configured guild id.

## 📂 File Structure

```plain
/src        → bot source code
/docs       → documentation
.env        → secrets (ignored)
```

---

## 🚨 Notes

- Do not commit `.env`.
- Update `app.config.ts` instead of hardcoding guild/role IDs.
- Keep personality strings in `/config/strings`.
