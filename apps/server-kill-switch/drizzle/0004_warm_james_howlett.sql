CREATE TABLE `discovered_machine` (
	`id` text PRIMARY KEY NOT NULL,
	`hostname` text NOT NULL,
	`ip` text,
	`source` text NOT NULL,
	`state` text DEFAULT 'NEW_MACHINE' NOT NULL,
	`fingerprint` text,
	`integrity_signature` text,
	`first_seen` integer NOT NULL,
	`last_seen` integer NOT NULL,
	`confirmed_at` integer,
	`confirmed_by` text
);
--> statement-breakpoint
CREATE INDEX `discovered_machine_hostname_idx` ON `discovered_machine` (`hostname`);--> statement-breakpoint
CREATE INDEX `discovered_machine_state_idx` ON `discovered_machine` (`state`);--> statement-breakpoint
CREATE INDEX `discovered_machine_last_seen_idx` ON `discovered_machine` (`last_seen`);--> statement-breakpoint
CREATE TABLE `discovered_model` (
	`id` text PRIMARY KEY NOT NULL,
	`machine_id` text NOT NULL,
	`provider_id` text NOT NULL,
	`model_id` text NOT NULL,
	`name` text NOT NULL,
	`size_bytes` integer,
	`quantization` text,
	`family` text,
	`served` integer DEFAULT false NOT NULL,
	`detected_at` integer NOT NULL,
	FOREIGN KEY (`machine_id`) REFERENCES `discovered_machine`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `discovered_model_machine_idx` ON `discovered_model` (`machine_id`);--> statement-breakpoint
CREATE INDEX `discovered_model_provider_idx` ON `discovered_model` (`provider_id`);--> statement-breakpoint
CREATE INDEX `discovered_model_model_idx` ON `discovered_model` (`model_id`);--> statement-breakpoint
CREATE TABLE `discovered_provider` (
	`id` text PRIMARY KEY NOT NULL,
	`machine_id` text NOT NULL,
	`provider_id` text NOT NULL,
	`base_url` text,
	`version` text,
	`status` text DEFAULT 'detected' NOT NULL,
	`detected_at` integer NOT NULL,
	`last_healthy_at` integer,
	FOREIGN KEY (`machine_id`) REFERENCES `discovered_machine`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `discovered_provider_machine_idx` ON `discovered_provider` (`machine_id`);--> statement-breakpoint
CREATE INDEX `discovered_provider_provider_idx` ON `discovered_provider` (`provider_id`);--> statement-breakpoint
CREATE TABLE `integrity_event` (
	`id` text PRIMARY KEY NOT NULL,
	`machine_id` text NOT NULL,
	`event` text NOT NULL,
	`severity` text DEFAULT 'low' NOT NULL,
	`drifted_fields` text,
	`detected_at` integer NOT NULL,
	FOREIGN KEY (`machine_id`) REFERENCES `discovered_machine`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `integrity_event_machine_idx` ON `integrity_event` (`machine_id`);--> statement-breakpoint
CREATE INDEX `integrity_event_time_idx` ON `integrity_event` (`detected_at`);--> statement-breakpoint
CREATE TABLE `webhook_api_key_audit` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`key_id` text,
	`action` text NOT NULL,
	`actor` text NOT NULL,
	`at` integer NOT NULL,
	`meta` text,
	`webhook_path` text
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