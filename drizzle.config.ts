/**
 * Drizzle Kit Configuration for Kill Switch Schema
 *
 * Uses Bun SQLite driver for migrations.
 */
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './apps/server-kill-switch/src/db/schema.ts',
  out: './apps/server-kill-switch/drizzle',
  dialect: 'sqlite',
  driver: 'bun-sqlite',
  dbCredentials: {
    url: './apps/server-kill-switch/data/kill-switch.sqlite',
  },
});
