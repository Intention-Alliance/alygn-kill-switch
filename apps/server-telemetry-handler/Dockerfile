FROM oven/bun:1.2-alpine

# System tools for hardware queries
RUN apk add --no-cache curl

WORKDIR /app

# Create data directory for SQLite
RUN mkdir -p /app/data

# Copy workspace root configs
COPY package.json ./package.json
COPY bun.lock ./bun.lock

# Copy packages
COPY packages/shared-types/ ./packages/shared-types/

# Copy infra modules (for Redis)
COPY infra/redis/ ./infra/redis/

# Copy service source
COPY apps/server-telemetry-handler/src/ ./apps/server-telemetry-handler/src/
COPY apps/server-telemetry-handler/package.json ./apps/server-telemetry-handler/package.json
COPY apps/server-telemetry-handler/tsconfig.json ./apps/server-telemetry-handler/tsconfig.json

# Install dependencies
RUN bun install

EXPOSE 3002

CMD ["bun", "run", "apps/server-telemetry-handler/src/index.ts"]
