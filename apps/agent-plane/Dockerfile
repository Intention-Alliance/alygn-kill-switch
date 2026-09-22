FROM oven/bun:1.2-alpine

WORKDIR /app

# pciutils for lspci (GPU fingerprinting); curl for health checks
RUN apk add --no-cache curl pciutils

# Local state directory (SQLite WAL)
RUN mkdir -p /app/data

# Copy workspace root configs
COPY package.json ./package.json
COPY bun.lock ./bun.lock

# Copy agent-plane source
COPY apps/agent-plane/package.json ./apps/agent-plane/package.json
COPY apps/agent-plane/tsconfig.json ./apps/agent-plane/tsconfig.json
COPY apps/agent-plane/src/ ./apps/agent-plane/src/

# Install dependencies
RUN bun install

EXPOSE 11435

# Use Bun for direct TypeScript execution
CMD ["bun", "run", "apps/agent-plane/src/index.ts"]
