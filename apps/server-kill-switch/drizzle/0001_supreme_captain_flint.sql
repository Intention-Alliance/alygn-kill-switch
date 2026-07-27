CREATE TABLE `webhook_api_key_audit` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`key_id` text,
	`action` text NOT NULL,
	`actor` text NOT NULL,
	`at` integer NOT NULL,
	`meta` text
);
--> statement-breakpoint
CREATE INDEX `webhook_api_key_audit_key_id_idx` ON `webhook_api_key_audit` (`key_id`);--> statement-breakpoint
CREATE INDEX `webhook_api_key_audit_at_idx` ON `webhook_api_key_audit` (`at`);--> statement-breakpoint
CREATE INDEX `webhook_api_key_audit_action_at_idx` ON `webhook_api_key_audit` (`action`,`at`);--> statement-breakpoint
CREATE TABLE `webhook_api_keys` (
	`id` text PRIMARY KEY NOT NULL,
	`key_prefix` text(8) NOT NULL,
	`api_key_hash` text(64) NOT NULL,
	`name` text NOT NULL,
	`scopes` text NOT NULL,
	`created_at` integer NOT NULL,
	`created_by` text DEFAULT 'system' NOT NULL,
	`last_used_at` integer,
	`last_used_ip` text,
	`revoked_at` integer,
	`revoked_by` text,
	`expires_at` integer,
	`notes` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `webhook_api_keys_apiKeyHash_unique` ON `webhook_api_keys` (`api_key_hash`);--> statement-breakpoint
CREATE INDEX `webhook_api_keys_prefix_idx` ON `webhook_api_keys` (`key_prefix`);--> statement-breakpoint
CREATE INDEX `webhook_api_keys_active_idx` ON `webhook_api_keys` (`revoked_at`,`expires_at`);