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
   # bare-node deployment (the current unit is still named "bissel-modern")
   pm2 restart bissel-modern
   # or
   systemctl restart bissel-modern
   ```

   > On the Docker deployment the service is `quil` (see docs/MIGRATION-docker.md):
   > `docker compose restart quil`

### Continuous deployment (self-hosted runner) — preferred once containerized

Once the box runs Docker (see below), deploys happen from the **GitHub Actions UI**,
not the shell — no SSH, no build on the box. Design rationale: **ADR-0006**.

**Deploy / roll back (day-to-day):**

1. Cut a release tag (`vX.Y.Z`) — `release.yml` builds & pushes the image to GHCR
   and auto-runs the deploy. To deploy or **roll back** manually: repo → **Actions →
   _Deploy to prod_ → Run workflow**, and enter the image tag (`latest`, a semver
   like `1.3.0`, or a `sha-<short>` tag). Older tags roll back with no rebuild.
2. The workflow pulls the tag, `docker compose up -d` (the entrypoint runs
   init+migrate), health-checks the `quil` container, then re-registers slash
   commands. Re-running is safe (idempotent).

**One-time box setup (Kali, amd64):**

```bash
# 1. Docker CE engine (docker-cli alone is client-only and will NOT run containers)
curl -fsSL https://get.docker.com | sh

# 2. Dedicated unprivileged runner user with docker access
sudo useradd -m -s /bin/bash quil-runner
sudo usermod -aG docker quil-runner          # docker group ≈ root; fine on a dedicated box

# 3. Fixed deploy dir holding .env + persistent data (migrate per docs/MIGRATION-docker.md)
sudo install -d -o quil-runner /opt/quil      # or set repo var QUIL_DEPLOY_DIR
#    place .env (with DISCORD_TOKEN etc.) and the migrated data/ under /opt/quil

# 4. Register the GitHub Actions runner (get URL + short-lived token from
#    repo → Settings → Actions → Runners → "New self-hosted runner", Linux x64)
sudo -iu quil-runner
mkdir actions-runner && cd actions-runner
curl -o r.tar.gz -L <URL_FROM_UI> && tar xzf r.tar.gz
./config.sh --url https://github.com/remnantwestmarches/quil \
            --token <SHORT_LIVED_TOKEN> --labels quil-prod --name kali-prod --unattended
exit

# 5. Install + start as a service so it survives reboot
cd /home/quil-runner/actions-runner
sudo ./svc.sh install quil-runner
sudo ./svc.sh start
```

The runner is **outbound-only** (long-polls GitHub) — no inbound ports. The
registration token is single-use (config only); afterwards the runner holds its own
credential. Coming from GitLab: there is **no docker executor** — steps run as shell
on the host, which is why the runner user needs the `docker` group.

> **Public-repo caveat:** if `remnantwestmarches/quil` is public, keep Actions →
> _Fork pull request workflows_ requiring approval and never add a `pull_request`
> trigger to a workflow that could run on this runner. `deploy.yml` only triggers on
> `workflow_dispatch`/`release`.

**Prerequisite:** the GHCR package must be **public** (or the box needs a read-only
pull token), so the runner can pull without stored credentials.

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
