CREATE TABLE `registration_request` (
	`id` text PRIMARY KEY NOT NULL,
	`machine_id` text NOT NULL,
	`requested_by` text DEFAULT 'system' NOT NULL,
	`status` text DEFAULT 'PENDING' NOT NULL,
	`denial_reason` text,
	`reviewed_by` text,
	`reviewed_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`machine_id`) REFERENCES `discovered_machine`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `registration_request_machine_idx` ON `registration_request` (`machine_id`);--> statement-breakpoint
CREATE INDEX `registration_request_status_idx` ON `registration_request` (`status`);--> statement-breakpoint
CREATE INDEX `registration_request_created_at_idx` ON `registration_request` (`created_at`);--> statement-breakpoint
CREATE TABLE `rogue_device_alert` (
	`id` text PRIMARY KEY NOT NULL,
	`hostname` text NOT NULL,
	`ip` text,
	`denial_count` integer DEFAULT 1 NOT NULL,
	`last_denied_at` integer NOT NULL,
	`resolved` integer DEFAULT false NOT NULL,
	`resolved_by` text,
	`resolved_at` integer,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `rogue_device_alert_hostname_idx` ON `rogue_device_alert` (`hostname`);--> statement-breakpoint
CREATE INDEX `rogue_device_alert_ip_idx` ON `rogue_device_alert` (`ip`);--> statement-breakpoint
CREATE INDEX `rogue_device_alert_resolved_idx` ON `rogue_device_alert` (`resolved`);--> statement-breakpoint
ALTER TABLE `machine` ADD `monitoring_only` integer DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `machine` ADD `zone` text DEFAULT 'unassigned' NOT NULL;