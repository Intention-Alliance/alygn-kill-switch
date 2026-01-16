import { config } from "dotenv";
import { existsSync } from "fs";
import { resolve } from "path";
import { z } from "zod";

/**
 * 1) dotenv load order
 *    - .env (common)
 *    - .env.{NODE_ENV}.local (environment-specific override, if exists)
 */
config(); // .env
const nodeEnv = process.env.NODE_ENV || "development";
const layerPath = resolve(process.cwd(), `.env.${nodeEnv}.local`);
if (existsSync(layerPath)) {
	config({ path: layerPath });
}

/**
 * 2) Zod schema definition
 *    - Required/optional/default policies can be modified as needed
 */
const EnvSchema = z
	.object({
		NODE_ENV: z
			.enum(["development", "production", "test"])
			.default("development"),
		PORT: z.coerce.number().int().positive().optional(), // Default value of 3000 handled in app.ts

		SECRET_KEY: z.string().min(1),

		LOG_FORMAT: z.string().min(1).optional(), // Default value of 'dev' handled in app.ts
		LOG_DIR: z.string().min(1),
		LOG_LEVEL: z.string().min(1),

		ORIGIN: z.string().min(1), // Can be converted to array if needed
		CREDENTIALS: z.coerce.boolean(), // Converts 'true'/'false' string → boolean
		CORS_ORIGINS: z.string().optional(), // "http://a.com,http://b.com"

		API_SERVER_URL: z.string().url().optional(),

		SENTRY_DSN: z.string().default(""),
		REDIS_URL: z.string().url().default("redis://localhost:6379"),
	})
	.strip();

/**
 * 3) Validation (executed at module import time)
 */
const parsed = EnvSchema.safeParse(process.env);
if (!parsed.success) {
	console.error("\n❌ Invalid environment variables:\n");
	console.error(parsed.error.format());
	process.exit(1);
}
const env = parsed.data;

/**
 * 4) Type-safe constant exports
 *    - Do not use process.env directly in other files, import from here instead.
 */
export const NODE_ENV = env.NODE_ENV;
export const PORT = env.PORT || 3001; // PORT || 3000 in app.ts
export const SECRET_KEY = env.SECRET_KEY || "";

export const LOG_FORMAT = env.LOG_FORMAT || "dev"; // LOG_FORMAT || 'dev' in app.ts
export const LOG_DIR = env.LOG_DIR || "./logs";
export const LOG_LEVEL = env.LOG_LEVEL || "debug";

export const ORIGIN = env.ORIGIN || "http://localhost:3001";
export const CREDENTIALS = env.CREDENTIALS || false;

export const SENTRY_DSN = env.SENTRY_DSN || "";
export const REDIS_URL = env.REDIS_URL || "redis://localhost:6379";
export const API_SERVER_URL = env.API_SERVER_URL || "";

// Provide CORS Origins as array (empty array if not set)
export const CORS_ORIGIN_LIST =
	env.CORS_ORIGINS?.split(",")
		.map((s) => s.trim())
		.filter(Boolean) ?? [];
