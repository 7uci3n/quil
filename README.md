# 🪶 Quil — Discord Guild Assistant

Modern Discord bot for D&D guilds and communities

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-20%2B-brightgreen)](https://nodejs.org/)
[![Discord.js](https://img.shields.io/badge/Discord.js-v14-blue)](https://discord.js.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue)](https://www.typescriptlang.org/)

**Quil** is a sophisticated Discord bot designed for D&D guilds, featuring character progression tracking, resource management, group finder tools, and an engaging personality system.

[🚀 Quick Start](#-quick-start-local-development) • [📖 Documentation](#-documentation) • [🎯 Features](#-features) • [🛠️ Tech Stack](#️-tech-stack)

---

## 🎌 Quick Start (local development)

Requirements

- Node.js LTS (v20 recommended)
- npm v9+

```powershell
git clone https://github.com/donovan-townes/bissel-modern.git
cd bissel-modern
# use npm ci for reproducible installs on CI/servers
npm ci

# copy env example and edit
cp .env.example .env

# initialize database (creates data/remnant.sqlite)
npm run db:init

# migrate database (creates/updates DB with new data for newer features in data/remnant.sqlite)
npm run db:migrate

# register slash commands to your dev guild (see docs/RUNBOOK.md)
npm run deploy:dev

# start in dev (tsx watcher)
npm run dev

# run tests (optional)
npm test
```

If successful, the console should log a ready message for the bot (e.g. "Ready! Logged in as <bot#tag>").

---

## 🐳 Run with Docker (recommended for operators)

No Node install, no build step. You need only Docker + the Docker Compose plugin.

```bash
# 1. Get the compose file and env template (or clone the repo)
curl -O https://raw.githubusercontent.com/remnantwestmarches/quil/main/docker-compose.yml
curl -o .env https://raw.githubusercontent.com/remnantwestmarches/quil/main/.env.example

# 2. Edit .env — set DISCORD_TOKEN, APP_ID, GUILD_ID
nano .env

# 3. Start the bot (pulls the prebuilt image from ghcr.io)
docker compose up -d

# 4. First run only (and whenever commands change): register slash commands
docker compose run --rm register

# Logs / stop / update
docker compose logs -f
docker compose down                 # stop (keeps the database)
docker compose pull && docker compose up -d   # update to the latest image
```

Operators pull the production image from **`ghcr.io/remnantwestmarches/quil`**
(public, multi-arch amd64/arm64) — the compose file uses it by default. (Developers
can point at a dev build with `QUIL_IMAGE=ghcr.io/7uci3n/quil` in `.env`, or build
locally via `build: .`.) Your character database lives in **`./data`** on the host
(bind mount) and survives `docker compose down` — back it up by copying that folder.
Create it writable by the container first: `mkdir -p data backups && sudo chown -R 1000:1000 data backups`.

**Already running the bare-node bot?** See
[docs/MIGRATION-docker.md](./docs/MIGRATION-docker.md) to move your existing
database across without data loss.

**Build from source instead** (devs / self-hosters): uncomment `build: .` in
`docker-compose.yml`, then `docker compose up -d --build`.

See [ADR-0002](./docs/adr/0002-containerization.md) for the design and the
(deferred) auto-deploy options.

---

## 🎯 Features

- **Character Management**: Track XP, levels, CP (Copper Pieces), GP (Gold Pieces), GT (Guild Tokens), DTP (Downtime Points), and CC (Crew Coins)
- **Resource Trading**: Multi-resource purchases and sales with integrated economy system
- **Looking for Group (LFG)**: Organize D&D sessions by tier and availability
- **DM Tools**: Toggle DM availability and manage guild operations
- **Guild Fund**: Collaborative resource pooling for guild activities
- **Personality System**: Quil's charming, literary voice with randomized response variants
- **Slash Commands**: Modern Discord integration with autocomplete and ephemeral responses
- **Robust Configuration**: Environment-based setup with guild-specific customization

---

## 📚 Documentation

- [📖 Docs Overview](./docs/README.md)
- [⚙️ Runbook](./docs/RUNBOOK.md)
- [📝 Development Log](./docs/DEVLOG.md)
- [🎭 Personality Guide](./docs/PERSONALITY.md)
- [🔧 Configuration](./docs/CONFIG.md)
- [💬 Strings & Localization](./docs/STRINGS.md)
- [🧪 Testing Guide](./tests/README.md)

---

## 🛠️ Tech Stack

- **Runtime**: Node.js 20+ LTS with TypeScript 5.x
- **Discord**: Discord.js v14 with slash commands and interactions
- **Database**: SQLite with better-sqlite3 for fast local storage
- **Configuration**: Zod validation with dotenv for environment management
- **Code Quality**: ESLint + Prettier with TypeScript-ESLint
- **Testing**: Vitest with in-memory SQLite for unit and integration tests
- **Development**: tsx for hot reloading and seamless TypeScript execution
- **Deployment**: Systemd services with automatic restarts and logging

---

## 🔨 Development

### Prerequisites

- Node.js 20+ LTS
- npm 9+
- A Discord application with bot token

### Testing

```powershell
npm test              # Run all tests
npm run test:watch    # Watch mode
npm run test:ui       # Visual test UI
npm run test:coverage # Coverage report
```

See [tests/README.md](./tests/README.md) for detailed testing guide.

### Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Follow the existing code style and add tests where appropriate
4. Update documentation for new commands or features
5. Commit your changes (`git commit -m 'Add amazing feature'`)
6. Push to the branch (`git push origin feature/amazing-feature`)
7. Open a Pull Request

See [CONTRIBUTING.md](./docs/CONTRIBUTING.md) for detailed development guidelines.

---

## 🏗️ Architecture

Quil follows a modular architecture with clear separation of concerns:

- **`src/commands/`** — Slash command handlers with consistent patterns
- **`src/config/`** — Configuration management and validation
- **`src/core/`** — Bot initialization and event handling
- **`src/db/`** — Database abstractions and query helpers
- **`src/domain/`** — Business logic for XP, rewards, and game mechanics
- **`src/lib/`** — Utilities including the i18n string system
- **`config/strings/`** — Localized response text with personality variants

## ©️ License

MIT License
