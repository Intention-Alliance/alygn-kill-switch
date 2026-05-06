FROM oven/bun:1.2-alpine

WORKDIR /app

# Install curl for health checks
RUN apk add --no-cache curl

# Create data directory for SQLite
RUN mkdir -p /app/data

# Copy workspace root configs
COPY package.json ./package.json
COPY bun.lock ./bun.lock

# Copy packages
COPY packages/db-schema/ ./packages/db-schema/
COPY packages/shared-types/ ./packages/shared-types/

# Copy infra modules (for Redis + tracing)
COPY infra/redis/ ./infra/redis/
COPY infra/tracing/ ./infra/tracing/

# Copy service source
COPY apps/server-kill-switch/src/ ./apps/server-kill-switch/src/
COPY apps/server-kill-switch/package.json ./apps/server-kill-switch/package.json
COPY apps/server-kill-switch/tsconfig.json ./apps/server-kill-switch/tsconfig.json

# Install dependencies
RUN bun install

# Dependencies installed; migrations run on app startup via initDatabase()
# (no drizzle-kit migration step needed in Docker build)

EXPOSE 3000

# Use Bun for direct TypeScript execution
CMD ["bun", "run", "apps/server-kill-switch/src/index.ts"]
