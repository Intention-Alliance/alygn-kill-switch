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

# Working directory where server.js lives
WORKDIR /app/repos/alygn/infrastructure/apps/web-regulator

# Copy static assets (CSS/JS chunks — not bundled in standalone output)
COPY apps/web-regulator/.next/static/ ./.next/static/

EXPOSE 3000

CMD ["bun", "run", "server.js"]
