FROM oven/bun:1.2-alpine AS builder
WORKDIR /app

# Copy admin-bff source
COPY apps/admin-bff/ ./apps/admin-bff/

# Install dependencies from within the app (not workspace)
RUN cd apps/admin-bff && bun install

# Build Next.js
RUN cd apps/admin-bff && bun run build

# Production image  
FROM oven/bun:1.2-alpine
WORKDIR /app

# Copy entire standalone output (preserves monorepo path structure)
# Structure: phase0/apps/admin-bff/server.js, phase0/node_modules/, node_modules/
COPY --from=builder /app/apps/admin-bff/.next/standalone ./
COPY --from=builder /app/apps/admin-bff/.next/static ./phase0/apps/admin-bff/.next/static
COPY --from=builder /app/apps/admin-bff/public ./phase0/apps/admin-bff/public

EXPOSE 3000

ENV HOSTNAME="0.0.0.0"
ENV PORT=3000
CMD ["bun", "run", "apps/admin-bff/server.js"]