# syntax=docker/dockerfile:1

# ---- builder: install deps (with native toolchain) and compile TypeScript ----
FROM node:24-bookworm AS builder
WORKDIR /app

# Native build toolchain for sqlite3 bindings (node-gyp)
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ \
 && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci
# better-sqlite3 ships prebuilt binaries that may target a newer glibc than the
# slim runtime — rebuild from source so it links against this image's glibc.
RUN npm rebuild better-sqlite3 --build-from-source

COPY tsconfig.json ./
COPY src ./src
COPY config ./config
RUN npm run build

# Runtime assets must sit where the *compiled* imports resolve them:
#   dist/src/domain/*.js       import ../../config/*.json     -> dist/config/*.json
#   dist/src/commands/health.js import ../../package.json      -> dist/package.json
RUN cp -r config dist/config && cp package.json dist/package.json

# Drop devDependencies; keep the already-compiled native prod bindings
RUN npm prune --omit=dev

# ---- runtime: slim image, no build toolchain, non-root ----
FROM node:24-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/config ./config
COPY --from=builder /app/package.json ./package.json
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh

RUN chmod +x /usr/local/bin/docker-entrypoint.sh \
 && mkdir -p /app/data /app/backups \
 && chown -R node:node /app

USER node

# SQLite database + backups are the only durable state — mount these as volumes.
VOLUME ["/app/data", "/app/backups"]

# entrypoint runs init + migrate (idempotent) then execs CMD
ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node", "--enable-source-maps", "dist/src/core/bot.js"]
