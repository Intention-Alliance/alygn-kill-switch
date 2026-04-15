FROM oven/bun:1.2-alpine

WORKDIR /app

# Install curl for health checks
RUN apk add --no-cache curl

# Copy shared modules (paths relative to build context: phase0/)
COPY redis/ ./redis/
COPY tracing/ ./tracing/

# Copy service to subdirectory (preserves ../redis/ import structure)
COPY kill-switch/kill-switch-service.mjs ./kill-switch/kill-switch-service.mjs

# Install dependencies
RUN bun add @opentelemetry/sdk-node @opentelemetry/auto-instrumentations-node \
    @opentelemetry/exporter-trace-otlp-grpc @opentelemetry/api \
    @opentelemetry/semantic-conventions redis

EXPOSE 3000

# Run from subdirectory so ../redis/ resolves to /app/redis/
CMD ["bun", "run", "kill-switch/kill-switch-service.mjs"]
