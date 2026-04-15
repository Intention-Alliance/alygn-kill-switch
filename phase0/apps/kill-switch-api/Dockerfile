FROM oven/bun:1.2-alpine

WORKDIR /app

# Install curl for health checks
RUN apk add --no-cache curl

# Copy shared modules (paths relative to build context: phase0/)
COPY infra/redis/ ./redis/
COPY infra/tracing/ ./tracing/

# Copy service source
COPY apps/kill-switch-api/src/ ./kill-switch/src/
COPY apps/kill-switch-api/package.json ./kill-switch/package.json
COPY apps/kill-switch-api/tsconfig.json ./kill-switch/tsconfig.json

# Copy shared packages
COPY packages/shared-types/ ./packages/shared-types/

# Install dependencies
RUN bun install

EXPOSE 3000

# Run from subdirectory so ../redis/ resolves to /app/redis/
CMD ["bun", "run", "kill-switch/src/index.ts"]