CREATE TABLE `chain_anchor` (
	`id` text PRIMARY KEY NOT NULL,
	`date` text NOT NULL,
	`chain_head_hash` text NOT NULL,
	`entry_count` integer DEFAULT 0 NOT NULL,
	`signed_payload` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `chain_anchor_date_unique` ON `chain_anchor` (`date`);--> statement-breakpoint
CREATE TABLE `first_access` (
	`id` text PRIMARY KEY NOT NULL,
	`key_id` text NOT NULL,
	`ip` text NOT NULL,
	`device_fp` text NOT NULL,
	`verified_at` integer,
	`challenge_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`key_id`) REFERENCES `webhook_keys`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `first_access_key_ip_device_unique` ON `first_access` (`key_id`,`ip`,`device_fp`);--> statement-breakpoint
CREATE INDEX `first_access_key_idx` ON `first_access` (`key_id`);--> statement-breakpoint
CREATE INDEX `first_access_verified_idx` ON `first_access` (`verified_at`);--> statement-breakpoint
CREATE TABLE `webhook_keys` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`hashed_secret` text(64) NOT NULL,
	`key_prefix` text(8) NOT NULL,
	`name` text NOT NULL,
	`allowed_machines` text DEFAULT '[]' NOT NULL,
	`allowed_zones` text DEFAULT '[]' NOT NULL,
	`allowed_models` text DEFAULT '[]' NOT NULL,
	`ip_map` text DEFAULT '[]' NOT NULL,
	`created_by_admin_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`rotated_at` integer,
	`revoked_at` integer,
	`last_used_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `webhook_keys_hashed_secret_unique` ON `webhook_keys` (`hashed_secret`);--> statement-breakpoint
CREATE INDEX `webhook_keys_org_idx` ON `webhook_keys` (`org_id`);--> statement-breakpoint
CREATE INDEX `webhook_keys_prefix_idx` ON `webhook_keys` (`key_prefix`);--> statement-breakpoint
CREATE INDEX `webhook_keys_active_idx` ON `webhook_keys` (`revoked_at`);--> statement-breakpoint
ALTER TABLE `kill_switch_audit_log` ADD `prev_hash` text DEFAULT 'GENESIS' NOT NULL;--> statement-breakpoint
ALTER TABLE `kill_switch_audit_log` ADD `self_hash` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `kill_switch_audit_log` ADD `actor_signature` text;--> statement-breakpoint
ALTER TABLE `kill_switch_audit_log` ADD `server_hmac` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `kill_switch_audit_log` ADD `plain_explanation` text DEFAULT '' NOT NULL;--> statement-breakpoint
CREATE INDEX `ks_audit_self_hash_idx` ON `kill_switch_audit_log` (`self_hash`);