CREATE TABLE `secrets_audit_log` (
	`id` text PRIMARY KEY NOT NULL,
	`ts` integer NOT NULL,
	`key_name` text NOT NULL,
	`action` text NOT NULL,
	`source_ip` text,
	`result` text NOT NULL,
	`actor` text,
	`meta` text
);
--> statement-breakpoint
CREATE INDEX `secrets_audit_key_time_idx` ON `secrets_audit_log` (`key_name`,`ts`);--> statement-breakpoint
CREATE INDEX `secrets_audit_action_time_idx` ON `secrets_audit_log` (`action`,`ts`);--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_flag_audit_log` (
	`id` text PRIMARY KEY NOT NULL,
	`flag_id` text,
	`action` text NOT NULL,
	`old_value` text,
	`new_value` text,
	`user_id` text NOT NULL,
	`timestamp` integer NOT NULL,
	`machine_id` text,
	FOREIGN KEY (`flag_id`) REFERENCES `feature_flag`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
INSERT INTO `__new_flag_audit_log`("id", "flag_id", "action", "old_value", "new_value", "user_id", "timestamp", "machine_id") SELECT "id", "flag_id", "action", "old_value", "new_value", "user_id", "timestamp", "machine_id" FROM `flag_audit_log`;--> statement-breakpoint
DROP TABLE `flag_audit_log`;--> statement-breakpoint
ALTER TABLE `__new_flag_audit_log` RENAME TO `flag_audit_log`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `flag_audit_flag_id_idx` ON `flag_audit_log` (`flag_id`);--> statement-breakpoint
CREATE INDEX `flag_audit_action_time_idx` ON `flag_audit_log` (`action`,`timestamp`);--> statement-breakpoint
CREATE INDEX `flag_audit_machine_id_idx` ON `flag_audit_log` (`machine_id`);