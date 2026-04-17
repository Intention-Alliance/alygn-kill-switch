FROM oven/bun:1.2-alpine

WORKDIR /app

# Install curl for health checks
RUN apk add --no-cache curl

# Copy workspace root for bun workspaces
COPY package.json ./package.json
COPY bun.lock ./bun.lock

# Copy shared packages
COPY packages/shared-types/ ./packages/shared-types/

# Copy infra modules (at workspace root level)
COPY infra/redis/ ./infra/redis/
COPY infra/tracing/ ./infra/tracing/

# Also copy infra where relative imports from src/ expect it
# From src/services/kill-switch.ts: ../../infra/ → apps/kill-switch-api/infra/
COPY infra/redis/ ./apps/kill-switch-api/infra/redis/
COPY infra/tracing/ ./apps/kill-switch-api/infra/tracing/

# Copy service source
COPY apps/kill-switch-api/src/ ./apps/kill-switch-api/src/
COPY apps/kill-switch-api/kill-switch-service.mjs ./apps/kill-switch-api/kill-switch-service.mjs
COPY apps/kill-switch-api/package.json ./apps/kill-switch-api/package.json
COPY apps/kill-switch-api/tsconfig.json ./apps/kill-switch-api/tsconfig.json

# Install dependencies
RUN bun install

EXPOSE 3000

# Run from workspace root so imports resolve correctly
CMD ["bun", "run", "apps/kill-switch-api/src/index.ts"]