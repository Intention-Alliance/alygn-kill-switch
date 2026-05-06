/**
 * Drizzle Kit Configuration for Kill Switch Schema
 *
 * Uses Bun SQLite driver for migrations.
 */
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './packages/db-schema/src/kill-switch/schema.ts',
  out: './apps/server-kill-switch/drizzle',
  dialect: 'sqlite',
  driver: 'bun-sqlite',
  dbCredentials: {
    url: './apps/server-kill-switch/data/kill-switch.sqlite',
  },
});
