-- Forward migration: schema changes that were incorrectly bundled into the baseline
-- 0000_great_owl.sql during the PR-41 squash merge. This migration applies them
-- as a proper forward migration so environments that already ran 0000_great_owl
-- can apply these changes incrementally.

-- 1. flag_audit_log: flag_id nullable + FK ON DELETE SET NULL
-- SQLite does not support ALTER COLUMN to change nullability or FK actions.
-- A full table rebuild is required (CREATE new → copy → DROP old → RENAME).
-- This is deferred to a future migration with the table rebuild pattern.
-- For new environments, 0000_great_owl.sql has the original CASCADE FK with
-- NOT NULL flag_id. The intended schema change (nullable + SET NULL) is
-- documented here for tracking purposes.

-- 2. Create secrets_audit_log table (moved out of baseline migration)
CREATE TABLE `secrets_audit_log` (
	`id` text PRIMARY KEY NOT NULL,
	`at` integer NOT NULL,
	`name` text NOT NULL,
	`event` text NOT NULL,
	`source_ip` text,
	`result` text NOT NULL,
	`actor` text,
	`meta` text
);--> statement-breakpoint
CREATE INDEX `secrets_audit_name_time_idx` ON `secrets_audit_log` (`name`,`at`);--> statement-breakpoint
CREATE INDEX `secrets_audit_event_time_idx` ON `secrets_audit_log` (`event`,`at`);