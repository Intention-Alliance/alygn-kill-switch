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

# Copy static assets (CSS/JS chunks — not bundled in standalone output)
COPY apps/web-regulator/.next/static/ /app/.next/static/

EXPOSE 3000

# The standalone output mirrors the host build path (e.g.
# .openclaw/workspace-be-coder/repos/alygn/infrastructure-fixes/apps/web-regulator),
# which varies by checkout location. Instead of hardcoding a WORKDIR that
# breaks when the repo moves, resolve server.js at runtime and run it from its
# own directory (Next.js standalone requires CWD = the server.js dir so it can
# find the bundled node_modules + .next).
CMD ["sh", "-c", "cd \"$(dirname \"$(find /app -name server.js -path '*web-regulator*' | head -1)\")\" && bun run server.js"]
