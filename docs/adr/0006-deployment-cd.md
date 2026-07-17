# 0006 - Continuous deployment via self-hosted runner + workflow_dispatch

**Status:** accepted
**Date:** 2026-07-17
**Spec:** docs/audit/REMEDIATION-PLAN.md (C-block / D8), docs/MIGRATION-docker.md
**Deciders:** maintainer (7uci3n), server ops

## Context

The production host is a **Kali GNU/Linux Rolling** box (2025.3, `6.16.8+kali-amd64`,
x86_64). It currently runs the bare-node bot; we are pivoting to the Docker image
published by `release.yml` to GHCR (ADR-0002). We need a way to get new versions
onto the box that satisfies real constraints:

- **Operators are not Linux-adept.** Deploys must be triggerable from an intuitive
  place, not an SSH shell or a hand-run script on the box.
- **Rollback matters.** Ops want to redeploy an older, known-good image without a
  rebuild.
- **Avoid direct/inbound access to the box.** No opening SSH/firewall inbound to a
  home/guild-run machine, and preferably no long-lived credentials copied onto it —
  the box is also a security-tooling distro.
- The `docker` package on Kali is a trap: `apt install docker-cli` installs the
  **client only** (no engine). A real engine is required. (See ADR decision below.)

## Decision

**Container runtime:** install **Docker CE** from Docker's official apt repo
(`get.docker.com`), giving `dockerd` + `docker` + `docker compose` v2. This keeps
`docker-compose.yml`, `docker-entrypoint.sh`, `docs/MIGRATION-docker.md`, and the
RUNBOOK working verbatim — no Podman/compose-compat adaptation.

**Delivery:** a **self-hosted GitHub Actions runner** on the box, driven by a new
`deploy.yml` workflow with two triggers:

- `workflow_dispatch` with a `tag` input (default `latest`) — the manual path.
  Deploy from the GitHub Actions UI ("Run workflow"); **roll back** by entering an
  older tag (e.g. `1.3.0`); **retrigger** by re-running.
- `release: published` — auto-deploys the just-released semver so the normal path
  needs no manual step.

The runner communicates **outbound-only** (long-polls GitHub), so **no inbound
access** is opened on the box. The job runs `docker compose pull && up -d` against a
**fixed deploy directory** on the box (holding `.env`, `data/`, `backups/`, and a
copy of `docker-compose.yml`), never the runner's ephemeral checkout — so the
persistent DB volume and secrets survive every deploy. `QUIL_TAG` is set from the
resolved tag; `QUIL_IMAGE` points at the production package.

**Slash-command sync** runs on every deploy: after the bot is healthy, the job runs
the `register` one-shot service (`docker compose run --rm register`) from the same
image, so command definition changes in a release reach Discord without a manual
step. Registration is idempotent (Discord dedupes), so re-running a deploy is safe.

**Registry access:** the GHCR package is made **public** (D9). The box then pulls a
public image and needs **no registry credential** stored on it.

**Rollback anchors:** `release.yml` already tags images by semver
(`{{version}}`, `{{major}}.{{minor}}`, `latest`). We add a `type=sha` tag for
between-release granularity. Any of these is a valid `tag` input.

## Consequences

- Ops deploy and roll back entirely from the GitHub Actions UI — no shell on the box.
- One-time setup on the box (documented in the RUNBOOK): install Docker CE, register
  the self-hosted runner as a dedicated unprivileged user with a repo-scoped label
  (`quil-prod`), create the fixed deploy dir with `.env` + `data/` (seeded via the
  bare-node → Docker migration in `docs/MIGRATION-docker.md`).
- The migration (schema init/migrate) still runs inside the container via
  `docker-entrypoint.sh` on first `up`, so baseline + better-sqlite3 land in one go
  (ADR-0004) — no two-step.
- Trade-offs accepted:
  - A long-running Actions runner service lives on a pentest-tooling box. Mitigated:
    unprivileged dedicated user, single-repo scope, no inbound, no registry secret
    (public package), image is our own build.
  - `workflow_dispatch` requires repo write access to trigger — acceptable, ops who
    deploy already have it; finer-grained access is a future concern.
  - Self-hosted runners on public repos can be abused by fork PRs; deploy jobs must be
    gated so they never run from untrusted PR triggers (only `workflow_dispatch` /
    `release`, which are maintainer-initiated).

## Runner setup (mechanism)

Unlike a GitLab runner (a daemon with a chosen executor — shell/docker/k8s), a GitHub
self-hosted runner is a per-repo agent that runs each step **as a shell command on
the host**; there is no "docker executor". Our steps therefore call the host's
Docker, so the runner's user must be in the `docker` group. Full step-by-step lives
in the RUNBOOK; the outline:

1. Install Docker CE (`get.docker.com`); create a dedicated unprivileged user
   (`quil-runner`) and add it to the `docker` group.
2. Get the download commands + a **short-lived** registration token from the repo:
   Settings → Actions → Runners → _New self-hosted runner_ (Linux x64).
3. `./config.sh --url https://github.com/remnantwestmarches/quil --token <TOKEN>
--labels quil-prod --name kali-prod --unattended` — matches `runs-on: [self-hosted,
quil-prod]`. The token is single-use for config; the runner then holds its own
   credential (no persistent registration token, unlike GitLab).
4. Install as a service so it survives reboot: `sudo ./svc.sh install quil-runner &&
sudo ./svc.sh start`. Verify it shows _Idle_ in the Runners list.

The runner is **outbound-only** (long-polls GitHub) — no inbound ports opened.

## Alternatives Considered

| Option                                              | Pros                                 | Cons                                                                                 | Why Not                                                                    |
| --------------------------------------------------- | ------------------------------------ | ------------------------------------------------------------------------------------ | -------------------------------------------------------------------------- |
| Manual `deploy.sh` on the box                       | Simplest; no runner                  | Requires SSH + Linux comfort                                                         | Maintainer vetoed — ops aren't Linux-adept, want to avoid touching the box |
| SSH from a GitHub-hosted runner                     | No agent on box                      | Needs **inbound** SSH + deploy key secret in GH                                      | Violates "no inbound / no direct connection" constraint                    |
| Pull-based auto-update (Watchtower / systemd timer) | Hands-off, outbound-only             | No explicit rollback UX; updates land on the tool's schedule, not on demand          | Ops want explicit trigger + rollback control                               |
| Podman instead of Docker CE                         | Daemonless/rootless, apt-installable | compose-compat + rootless bind-mount UID mapping need validation; docs assume Docker | Extra work for no required benefit here                                    |

## Links

- Supersedes: N/A
- Related: ADR-0002 (containerization), ADR-0004 (better-sqlite3 / one-shot migrate),
  docs/MIGRATION-docker.md, docs/audit/REMEDIATION-PLAN.md (D8/D9)
