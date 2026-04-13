FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
WORKDIR /app

# ------- dependency layer -------
FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/api/package.json apps/api/package.json
COPY packages/ai/package.json packages/ai/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN pnpm install --frozen-lockfile

# ------- source layer -------
FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=deps /app/packages/ai/node_modules ./packages/ai/node_modules
COPY --from=deps /app/packages/shared/node_modules ./packages/shared/node_modules

# Copy workspace source files needed at runtime
COPY tsconfig.json ./
COPY packages/shared/ packages/shared/
COPY packages/ai/ packages/ai/
COPY apps/api/ apps/api/

# ------- runtime -------
FROM base AS runtime
ENV NODE_ENV=production
WORKDIR /app

# Copy everything from build — tsx runs TypeScript source directly
COPY --from=build /app ./

EXPOSE 4000
CMD ["pnpm", "--filter", "@template/api", "exec", "tsx", "src/index.ts"]
