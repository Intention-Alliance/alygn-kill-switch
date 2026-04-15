FROM oven/bun:1.2-alpine AS builder
WORKDIR /app

# Copy workspace files
COPY package.json ./package.json
COPY apps/admin-bff/package.json ./apps/admin-bff/package.json
COPY packages/shared-types/ ./packages/shared-types/
COPY bun.lock ./bun.lock

# Install dependencies
RUN bun install --frozen-lockfile

# Copy admin-bff source
COPY apps/admin-bff/ ./apps/admin-bff/

# Build Next.js
RUN cd apps/admin-bff && bun run build

# Production image
FROM oven/bun:1.2-alpine
WORKDIR /app

COPY --from=builder /app/apps/admin-bff/.next/standalone ./
COPY --from=builder /app/apps/admin-bff/.next/static ./apps/admin-bff/.next/static
COPY --from=builder /app/apps/admin-bff/public ./apps/admin-bff/public

EXPOSE 3000

ENV HOSTNAME="0.0.0.0"
CMD ["bun", "run", "apps/admin-bff/server.js"]