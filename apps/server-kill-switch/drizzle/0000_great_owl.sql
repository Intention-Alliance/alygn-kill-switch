CREATE TABLE `account` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`account_id` text NOT NULL,
	`provider_id` text NOT NULL,
	`access_token` text,
	`refresh_token` text,
	`access_token_expires_at` integer,
	`refresh_token_expires_at` integer,
	`scope` text,
	`id_token` text,
	`password` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `account_user_id_idx` ON `account` (`user_id`);--> statement-breakpoint
CREATE TABLE `agent` (
	`id` text PRIMARY KEY NOT NULL,
	`machine_id` text NOT NULL,
	`name` text NOT NULL,
	`version` text NOT NULL,
	`capabilities` text,
	`last_heartbeat` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`machine_id`) REFERENCES `machine`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `agent_machine_idx` ON `agent` (`machine_id`);--> statement-breakpoint
CREATE INDEX `agent_heartbeat_idx` ON `agent` (`last_heartbeat`);--> statement-breakpoint
CREATE TABLE `feature_flag` (
	`id` text PRIMARY KEY NOT NULL,
	`key` text NOT NULL,
	`value` integer NOT NULL,
	`description` text,
	`enabled` integer DEFAULT true,
	`created_by` text DEFAULT 'admin' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `feature_flag_key_unique` ON `feature_flag` (`key`);--> statement-breakpoint
CREATE UNIQUE INDEX `feature_flag_key_idx` ON `feature_flag` (`key`);--> statement-breakpoint
CREATE TABLE `flag_audit_log` (
	`id` text PRIMARY KEY NOT NULL,
	`flag_id` text NOT NULL,
	`action` text NOT NULL,
	`old_value` text,
	`new_value` text,
	`user_id` text NOT NULL,
	`timestamp` integer NOT NULL,
	`machine_id` text,
	FOREIGN KEY (`flag_id`) REFERENCES `feature_flag`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `flag_audit_flag_id_idx` ON `flag_audit_log` (`flag_id`);--> statement-breakpoint
CREATE INDEX `flag_audit_action_time_idx` ON `flag_audit_log` (`action`,`timestamp`);--> statement-breakpoint
CREATE INDEX `flag_audit_machine_id_idx` ON `flag_audit_log` (`machine_id`);--> statement-breakpoint
CREATE TABLE `kill_switch_audit_log` (
	`id` text PRIMARY KEY NOT NULL,
	`timestamp` integer NOT NULL,
	`user_id` text NOT NULL,
	`reason` text NOT NULL,
	`previous_state` text NOT NULL,
	`new_state` text NOT NULL,
	`trace_id` text NOT NULL,
	`machine_id` text,
	`severity` text DEFAULT 'info' NOT NULL,
	`metadata` text
);
--> statement-breakpoint
CREATE INDEX `ks_audit_severity_time_idx` ON `kill_switch_audit_log` (`severity`,`timestamp`);--> statement-breakpoint
CREATE INDEX `ks_audit_machine_time_idx` ON `kill_switch_audit_log` (`machine_id`,`timestamp`);--> statement-breakpoint
CREATE INDEX `ks_audit_state_time_idx` ON `kill_switch_audit_log` (`new_state`,`timestamp`);--> statement-breakpoint
CREATE TABLE `kill_switch_state` (
	`id` text PRIMARY KEY NOT NULL,
	`state` text DEFAULT 'ARMED' NOT NULL,
	`updated_by` text DEFAULT 'system' NOT NULL,
	`reason` text DEFAULT 'manual' NOT NULL,
	`ip_address` text,
	`trace_id` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `machine_flag` (
	`machine_id` text NOT NULL,
	`flag_key` text NOT NULL,
	`value` text,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`machine_id`, `flag_key`),
	FOREIGN KEY (`machine_id`) REFERENCES `machine`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `machine_flag_key_idx` ON `machine_flag` (`flag_key`);--> statement-breakpoint
CREATE TABLE `machine` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`hostname` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`role` text NOT NULL,
	`has_dpu` integer DEFAULT false NOT NULL,
	`specs` text,
	`last_seen` integer,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `machine_hostname_unique` ON `machine` (`hostname`);--> statement-breakpoint
CREATE UNIQUE INDEX `machine_hostname_idx` ON `machine` (`hostname`);--> statement-breakpoint
CREATE INDEX `machine_status_idx` ON `machine` (`status`);--> statement-breakpoint
CREATE TABLE `session` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`token` text NOT NULL,
	`expires_at` integer NOT NULL,
	`ip_address` text,
	`user_agent` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `session_token_unique` ON `session` (`token`);--> statement-breakpoint
CREATE INDEX `session_user_id_idx` ON `session` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `session_token_idx` ON `session` (`token`);--> statement-breakpoint
CREATE TABLE `setting` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `user` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`email_verified` integer DEFAULT false,
	`name` text,
	`image` text,
	`role` text DEFAULT 'admin',
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_email_unique` ON `user` (`email`);--> statement-breakpoint
CREATE UNIQUE INDEX `user_email_idx` ON `user` (`email`);--> statement-breakpoint
CREATE TABLE `verification` (
	`id` text PRIMARY KEY NOT NULL,
	`identifier` text NOT NULL,
	`value` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `verification_identifier_idx` ON `verification` (`identifier`);