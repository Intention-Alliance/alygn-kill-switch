# ============================================================
# Dignity Verifier Dashboard — Multi-stage Dockerfile
# ============================================================
# Next.js standalone build (like web-regulator) but with a
# proper multi-stage build: builder (bun install + next build)
# → runner (standalone output, minimal image).
#
# Build:
#   docker compose -f apps/dignity-verifier/docker-compose.yml build
#
# The build context is the repo root (../..) so the Dockerfile
# can COPY the dashboard source + workspace configs.
# ============================================================

# ─── Stage 1: Builder ────────────────────────────────────────
FROM oven/bun:1.2-alpine AS builder

WORKDIR /app

# Copy workspace root configs (lockfile for reproducible installs)
COPY package.json ./package.json
COPY bun.lock ./bun.lock
COPY bunfig.toml ./bunfig.toml

# Copy the dashboard source
COPY apps/dignity-verifier/dashboard/package.json ./apps/dignity-verifier/dashboard/package.json
COPY apps/dignity-verifier/dashboard/tsconfig.json ./apps/dignity-verifier/dashboard/tsconfig.json
COPY apps/dignity-verifier/dashboard/next.config.ts ./apps/dignity-verifier/dashboard/next.config.ts
COPY apps/dignity-verifier/dashboard/postcss.config.js ./apps/dignity-verifier/dashboard/postcss.config.js
COPY apps/dignity-verifier/dashboard/src/ ./apps/dignity-verifier/dashboard/src/

# Copy the seed + eval datasets (read-only at runtime; persisted artifacts
# live in the /app/data volume, not here).
COPY apps/dignity-verifier/dataset/ ./dataset/

# Install dependencies (workspace-aware)
RUN cd apps/dignity-verifier/dashboard && bun install

# Point the build-time prerender at the copied dataset (home page renders
# dataset stats at build time).
ENV DATASET_DIR=/app/dataset

# Build the standalone Next.js output
RUN cd apps/dignity-verifier/dashboard && bun run build

# ─── Stage 2: Runner ──────────────────────────────────────────
FROM oven/bun:1.2-alpine AS runner

ENV NODE_ENV=production
ENV PORT=3000

# curl for healthchecks
RUN apk add --no-cache curl

# Create non-root user (deployment LAW: non-root by default)
RUN addgroup -S nodejs && adduser -S nextjs -G nodejs

# Copy standalone output (includes server.js + layered node_modules)
COPY --from=builder /app/apps/dignity-verifier/dashboard/.next/standalone/ /app/

# Copy static assets (CSS/JS chunks — not bundled in standalone output).
# Next.js standalone expects .next/static/ relative to the server.js CWD.
# The server.js lives at /app/apps/dignity-verifier/dashboard/server.js,
# so we copy static to BOTH the standalone root (/app/.next/static)
# AND the server CWD (/app/apps/dignity-verifier/dashboard/.next/static)
# to ensure the CSS/JS chunks are served regardless of path resolution.
COPY --from=builder /app/apps/dignity-verifier/dashboard/.next/static/ /app/.next/static/
RUN cp -r /app/.next/static /app/apps/dignity-verifier/dashboard/.next/static 2>/dev/null || true

# Copy the seed + eval datasets (read-only). The /app/data volume holds
# persisted runtime artifacts (DB, augmented output) and does NOT shadow this.
COPY --from=builder /app/dataset/ /app/dataset/

# Create data dir for dataset + model artifacts (owned by nextjs)
RUN mkdir -p /app/data && chown -R nextjs:nodejs /app

USER nextjs

EXPOSE 3000

# The standalone output mirrors the host build path, which varies by
# checkout location. Resolve server.js at runtime (excluding node_modules
# so we don't pick up Next's internal testmode server) and run it from its
# own directory (Next.js standalone requires CWD = the server.js dir).
CMD ["sh", "-c", "cd \"$(dirname \"$(find /app -name server.js -not -path '*/node_modules/*' | head -1)\")\" && bun run server.js"]
