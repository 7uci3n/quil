# 0002 - Containerization & Image Distribution

**Status:** accepted
**Date:** 2026-07-17
**Spec:** \_project_specs/overview.md
**Deciders:** Project maintainers

## Context

Operators (some unfamiliar with the code) need to install and run Quil without a
Node toolchain, native build steps, or per-machine setup. The bot is a long-running,
**outbound-only** Discord gateway client (no inbound HTTP), with **SQLite** as its
only durable state and secrets supplied via `.env`. The live DB layer is the async
`sqlite` + `sqlite3` wrapper (see audit `DEP-1`; `better-sqlite3` is unused).

## Decision

Ship Quil as a Docker image and run it via `docker compose`.

1. **Image:** multi-stage `Dockerfile`. Builder (Debian `node:20-bookworm` +
   `python3/make/g++`) runs `npm ci` and `npm run build`, copies `config/` and
   `package.json` into `dist/` (the compiled `../../config/*.json` and
   `../../package.json` imports resolve there), then `npm prune --omit=dev`. Runtime
   is `node:20-bookworm-slim`, non-root (`node` user), no toolchain.
2. **Startup:** `docker-entrypoint.sh` runs `init.db` then `migrate.db` (both
   idempotent; order matters because migrate `ALTER`s an existing table and
   `initDb`'s `charlog` omits the `dtp`/`dtp_updated`/`cc` columns that migrate adds),
   then `exec`s the bot so it receives `SIGTERM`.
3. **State:** **bind mounts** `./data` → `/app/data` and `./backups` → `/app/backups`
   (chosen over named volumes to make migrating an existing bare-node DB trivial and
   backups host-visible; the container's non-root `node` user is uid 1000, so the host
   folders need `chown 1000:1000`). Secrets via `env_file: .env`, never baked in.
4. **Registry:** **GitHub Container Registry**, image made **public**. Chosen over
   Docker Hub (pull rate limits, separate account) and over a private image (a private
   image forces every operator to `docker login` with a PAT, defeating the one-command
   goal; the image contains no secrets, so there is nothing to protect). Built
   multi-arch (`linux/amd64` + `linux/arm64` — the deploy target is ARM) and pushed by
   `.github/workflows/release.yml` on version tags/releases, using the built-in
   `GITHUB_TOKEN`.
5. **Fork topology (dev vs production registry).** Development happens on the
   `7uci3n/quil` fork; changes are PR'd into `remnantwestmarches/quil` (the D&D
   server's canonical fork) before deploy. The **production image operators pull is
   `ghcr.io/remnantwestmarches/quil`**. Mechanics:
   - `release.yml` names the image `ghcr.io/${{ github.repository }}`, so it publishes
     to whichever repo runs it — production image on an upstream release, a throwaway
     test image on a dev-fork tag. No per-repo edits.
   - `docker-compose.yml` defaults to `ghcr.io/remnantwestmarches/quil` via
     `${QUIL_IMAGE:-…}`; devs override `QUIL_IMAGE`/`QUIL_TAG` (or use `build: .`).
   - `docker-build.yml` runs on the dev fork's PRs/pushes to verify the image builds
     (+ entrypoint smoke test) **without** publishing.
6. **Command registration** is a one-shot `register` compose service (`tools`
   profile), run on demand: `docker compose run --rm register`.

## Consequences

- Install becomes: get `docker-compose.yml` + `.env`, fill secrets, `docker compose up -d`.
- Required companion fixes (done with this ADR): audit `OPS-01` (SIGINT+SIGTERM
  handlers that close the DB) and `BUG-12` (`init.db` now exits cleanly) — without
  them container stop/entrypoint chaining would misbehave.
- **One-time manual step (on `remnantwestmarches/quil`):** the first GHCR push creates
  a _private_ package by default; set the package visibility to **Public** once in the
  org's Packages settings so operators pull without login. The org may also need to
  allow GitHub Actions to create/write packages (Actions → Workflow permissions).
- The unused `better-sqlite3` dep (audit `DEP-1`) still compiles natively during build,
  adding build time; resolving `DEP-1` will speed image builds.
- No container healthcheck yet (bot has no HTTP port). Optional future: a tiny
  `/healthz` server to enable `HEALTHCHECK` and orchestrator liveness.

## Deferred: continuous deploy (auto-update the running bot)

Not decided here — the deploy box is **not** the current dev box and its details are
unknown. This ADR deliberately stops at "a published image + compose." A future
ADR will choose a CD mechanism once we know, for the deploy box:

- OS / arch / Docker (and compose) version present;
- inbound access (SSH reachable? behind NAT? pull-only?);
- how secrets/`.env` are managed there;
- update cadence & rollback expectations.

Candidate mechanisms, all of which consume this same GHCR image:

- **Watchtower** on the box — polls GHCR, auto-pulls & restarts. Simplest, pull-only.
- **SSH deploy job** in Actions — `ssh box 'docker compose pull && up -d'` after release.
- **Self-hosted GitHub runner** on the box — runs the deploy step locally.
- **Webhook / GitOps** — box pulls on a push event.

## Links

- docs/audit/REMEDIATION-PLAN.md (OPS-01, BUG-12, DEP-1)
- Dockerfile, docker-compose.yml, docker-entrypoint.sh, .github/workflows/release.yml
