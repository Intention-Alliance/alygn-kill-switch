import { LOG_DIR, LOG_LEVEL, NODE_ENV } from "@config/env";
import { existsSync, mkdirSync } from "fs";
import { join } from "path";
import pino from "pino";

// Log environment configuration
const isProd = NODE_ENV === "production";
const logRoot = LOG_DIR || "logs";
const logLevel = LOG_LEVEL || "info";

// Create logs folder in current runtime location (project execution directory)
const projectRoot = process.cwd(); // Current process execution directory
const logDir = join(projectRoot, logRoot);

// Create log directory (with error handling)
try {
	if (!existsSync(logDir)) {
		mkdirSync(logDir, { recursive: true });
		console.log(`[Logger Init] Created log directory: ${logDir}`);
	} else {
		console.log(`[Logger Init] Log directory already exists: ${logDir}`);
	}
} catch (error) {
	console.error(
		`[Logger Init] Failed to create log directory: ${logDir}`,
		error,
	);
	throw error;
}

// Paths for file logging
const prodFile = join(logDir, "app");
const devFile = join(logDir, "app.dev");
const errorFile = join(logDir, "error");

// Pino instance
const transport = pino.transport({
	targets: isProd
		? [
				// prod: Date/size based rolling + 30 days retention (full logs)
				{
					target: "pino-roll",
					level: logLevel,
					options: {
						file: prodFile, // Final file: app.2025-08-29.log etc
						frequency: "daily", // 'daily' | 'hourly' | number(ms)
						size: "50m", // Split by size
						dateFormat: "yyyy-MM-dd",
						extension: ".log",
						mkdir: true,
						symlink: true, // Create current.log symlink
						limit: { count: 30 }, // Retain 30 files
						// limit: { count: 30, removeOtherLogFiles: false }, // Note for PM2/Cluster
					},
				},
				// prod: Error only file (60 days retention policy etc)
				{
					target: "pino-roll",
					level: "error",
					options: {
						file: errorFile,
						frequency: "daily",
						size: "50m",
						dateFormat: "yyyy-MM-dd",
						extension: ".log",
						mkdir: true,
						symlink: true,
						limit: { count: 60 },
					},
				},
			]
		: [
				// dev: Pretty console output
				{
					target: "pino-pretty",
					level: logLevel,
					options: {
						colorize: true,
						translateTime: "yyyy-mm-dd HH:MM:ss",
						ignore: "pid,hostname",
					},
				},
				// dev: If you also want file logging (optional) - delete block if unnecessary
				{
					target: "pino-roll",
					level: logLevel,
					options: {
						file: devFile,
						frequency: "daily",
						size: "20m",
						dateFormat: "yyyy-MM-dd",
						extension: ".log",
						mkdir: true,
						symlink: true,
						limit: { count: 7 },
					},
				},
			],
});

// ── Logger Instance
export const logger = pino(
	{
		level: logLevel,
		base: undefined,
		timestamp: pino.stdTimeFunctions.isoTime,
		redact: {
			paths: ["req.headers.authorization", "password", "token"],
			censor: "[REDACTED]",
		},
	},
	transport,
);

// morgan stream
export const stream = { write: (msg: string) => logger.info(msg.trim()) };
