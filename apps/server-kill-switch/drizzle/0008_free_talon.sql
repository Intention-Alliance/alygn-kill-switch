CREATE TABLE `inference_log` (
	`id` text PRIMARY KEY NOT NULL,
	`timestamp` integer NOT NULL,
	`machine_id` text NOT NULL,
	`method` text NOT NULL,
	`path` text NOT NULL,
	`score` real DEFAULT 0 NOT NULL,
	`action` text NOT NULL,
	`reasons` text,
	`alert` integer DEFAULT false NOT NULL,
	`scored` integer DEFAULT true NOT NULL,
	`prompt_preview` text,
	`model` text
);
--> statement-breakpoint
CREATE INDEX `inference_log_time_idx` ON `inference_log` (`timestamp`);--> statement-breakpoint
CREATE INDEX `inference_log_machine_idx` ON `inference_log` (`machine_id`);--> statement-breakpoint
CREATE TABLE `verification_event` (
	`id` text PRIMARY KEY NOT NULL,
	`request_id` text NOT NULL,
	`machine_id` text,
	`verdict` text NOT NULL,
	`confidence` real,
	`reason` text,
	`model` text NOT NULL,
	`degraded` integer DEFAULT false NOT NULL,
	`prompt_hash` text,
	`output_hash` text,
	`triggered_kill` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `verification_event_request_idx` ON `verification_event` (`request_id`);--> statement-breakpoint
CREATE INDEX `verification_event_verdict_idx` ON `verification_event` (`verdict`);--> statement-breakpoint
CREATE INDEX `verification_event_time_idx` ON `verification_event` (`created_at`);--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_feature_flag` (
	`id` text PRIMARY KEY NOT NULL,
	`key` text NOT NULL,
	`value` text NOT NULL,
	`description` text,
	`enabled` integer DEFAULT true,
	`created_by` text DEFAULT 'admin' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_feature_flag`("id", "key", "value", "description", "enabled", "created_by", "created_at", "updated_at") SELECT "id", "key", "value", "description", "enabled", "created_by", "created_at", "updated_at" FROM `feature_flag`;--> statement-breakpoint
DROP TABLE `feature_flag`;--> statement-breakpoint
ALTER TABLE `__new_feature_flag` RENAME TO `feature_flag`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `feature_flag_key_unique` ON `feature_flag` (`key`);--> statement-breakpoint
CREATE UNIQUE INDEX `feature_flag_key_idx` ON `feature_flag` (`key`);--> statement-breakpoint
CREATE TABLE `__new_user` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`email_verified` integer DEFAULT false,
	`name` text,
	`image` text,
	`role` text DEFAULT 'viewer',
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_user`("id", "email", "email_verified", "name", "image", "role", "created_at", "updated_at") SELECT "id", "email", "email_verified", "name", "image", "role", "created_at", "updated_at" FROM `user`;--> statement-breakpoint
DROP TABLE `user`;--> statement-breakpoint
ALTER TABLE `__new_user` RENAME TO `user`;--> statement-breakpoint
CREATE UNIQUE INDEX `user_email_unique` ON `user` (`email`);--> statement-breakpoint
CREATE UNIQUE INDEX `user_email_idx` ON `user` (`email`);
--> statement-breakpoint
-- P1-1 data backfill: the pre-existing `user` table declared DEFAULT 'admin'
-- (drizzle/0000_salty_mysterio.sql:151). CREATE TABLE IF NOT EXISTS never
-- alters existing rows, so accounts created before the schema default changed
-- to 'viewer' still carry role='admin'. Demote every non-seed account.
-- The seeded admin (lib/auth.ts seedAdminUser: ADMIN_EMAIL || 'admin@alygn.com')
-- is preserved. If ADMIN_EMAIL is overridden in the deployment env, adjust the
-- literal below to match before applying this migration.
UPDATE `user` SET `role` = 'viewer' WHERE `email` <> 'admin@alygn.com' AND (`role` = 'admin' OR `role` IS NULL);
