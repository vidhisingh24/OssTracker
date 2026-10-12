# syntax=docker/dockerfile:1.7
FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@11.15.0 --activate
WORKDIR /app

FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/web/package.json apps/web/
COPY apps/worker/package.json apps/worker/
COPY packages/core/package.json packages/core/
RUN pnpm install --frozen-lockfile

FROM deps AS build
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1 NODE_ENV=production DEMO_MODE=true NEXT_STANDALONE=1
RUN pnpm --filter @contrib/web build

# ── web: Next.js standalone server ──
FROM node:22-alpine AS web
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0 MIGRATIONS_DIR=/app/packages/core/drizzle
COPY --from=build /app/apps/web/.next/standalone ./
COPY --from=build /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=build /app/apps/web/public ./apps/web/public
COPY --from=build /app/packages/core/drizzle ./packages/core/drizzle
USER node
EXPOSE 3000
CMD ["node", "apps/web/server.js"]

# ── worker: pg-boss consumer (runs TS via tsx) ──
FROM deps AS worker
COPY . .
ENV NODE_ENV=production MIGRATIONS_DIR=/app/packages/core/drizzle
USER node
CMD ["pnpm", "--filter", "@contrib/worker", "start"]
