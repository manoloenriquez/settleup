# syntax=docker/dockerfile:1
# Production image for the SettleUp AI API (apps/api) — a long-running Hono server.
#
# IMPORTANT: build context MUST be the monorepo ROOT (this is a pnpm workspace and
# the API depends on @template/ai and @template/shared via workspace links):
#   docker build -f apps/api/Dockerfile -t settleup-api .
#
# The repo uses node-linker=hoisted (.npmrc), so node_modules is a single flat
# tree at /app/node_modules — there are no per-package node_modules dirs to copy.
FROM node:22-alpine
# Install pnpm directly (more robust across platforms than corepack's download +
# signature verification, which can fail in some CI/build environments).
RUN npm install -g pnpm@9.15.0
WORKDIR /app

# .dockerignore excludes node_modules + build artifacts, forcing a clean install.
# Install only the API workspace subset (it + @template/ai + @template/shared).
COPY . .
RUN pnpm install --frozen-lockfile --filter @template/api...

ENV NODE_ENV=production
WORKDIR /app/apps/api

# The host injects PORT; the server falls back to 4000 (see src/index.ts).
EXPOSE 4000

# @template/ai and @template/shared are consumed as TypeScript source, so they
# are transpiled at runtime by tsx rather than pre-built to JS.
CMD ["pnpm", "exec", "tsx", "src/index.ts"]
