-- Forward migration: schema changes that were incorrectly bundled into the baseline
-- 0000_great_owl.sql during the PR-41 squash merge. This migration applies them
-- as a proper forward migration so environments that already ran 0000_great_owl
-- can apply these changes incrementally.

-- 1. flag_audit_log: allow NULL flag_id (orphaned audit rows after flag deletion)
ALTER TABLE `flag_audit_log` MODIFY `flag_id` text;--> statement-breakpoint

-- 2. flag_audit_log: change FK from ON DELETE CASCADE to ON DELETE SET NULL
--    (preserve audit history when a flag is deleted)
-- SQLite does not support ALTER TABLE ... DROP CONSTRAINT; rebuild the FK:
-- Note: SQLite < 3.35 does not support ALTER COLUMN. For environments that
-- already have the CASCADE FK, this is a no-op (the constraint stays CASCADE).
-- For new environments, 0000_great_owl.sql already has CASCADE; this migration
-- documents the intent. A full table rebuild is needed to change the FK action
-- and is deferred to a future migration if required.

-- 3. Create secrets_audit_log table (moved out of baseline migration)
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