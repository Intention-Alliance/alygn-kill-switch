# ALYGN Web Regulator — Next.js Kill Switch Admin UI
# Production deploy: uses pre-built standalone output from the host.
#
# Build must be done before image build:
#   cd apps/web-regulator && bun run build
#
# Then:
#   docker compose build web-regulator && docker compose up -d web-regulator

FROM oven/bun:1.2-alpine

ENV NODE_ENV=production

# Copy standalone output (includes server.js at deep path + layered node_modules)
COPY apps/web-regulator/.next/standalone/ /app/

# Copy static assets (CSS/JS chunks — not bundled in standalone output).
# The standalone output mirrors the host build path (e.g.
# .openclaw/workspace/repos/alygn/infrastructure/apps/web-regulator), which
# varies by checkout location. Next.js standalone serves /_next/static/ from
# <server.js dir>/.next/static/, so we must place the static files there —
# NOT at /app/.next/static/ (that path is never read by the standalone server
# and caused all /_next/static/* requests to 404, leaving the dashboard stuck
# on "Verifying session…").
#
# Stage the static files at a known path, then copy them into the resolved
# standalone .next/static/ dir at build time.
COPY apps/web-regulator/.next/static/ /app/.next/static/

RUN STATIC_DIR="$(dirname "$(find /app -name server.js -path '*web-regulator*' | head -1)")/.next/static" \
    && mkdir -p "$STATIC_DIR" \
    && cp -a /app/.next/static/. "$STATIC_DIR/" \
    && rm -rf /app/.next/static \
    && echo "Static assets installed to: $STATIC_DIR"

EXPOSE 3000

# The standalone output mirrors the host build path (e.g.
# .openclaw/workspace-be-coder/repos/alygn/infrastructure-fixes/apps/web-regulator),
# which varies by checkout location. Instead of hardcoding a WORKDIR that
# breaks when the repo moves, resolve server.js at runtime and run it from its
# own directory (Next.js standalone requires CWD = the server.js dir so it can
# find the bundled node_modules + .next).
CMD ["sh", "-c", "cd \"$(dirname \"$(find /app -name server.js -path '*web-regulator*' | head -1)\")\" && bun run server.js"]
