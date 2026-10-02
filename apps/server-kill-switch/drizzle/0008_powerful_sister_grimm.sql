CREATE TABLE `machine_heartbeat_log` (
	`id` text PRIMARY KEY NOT NULL,
	`machine_id` text NOT NULL,
	`timestamp` integer NOT NULL,
	`cpu` real,
	`memory` real,
	`status` text DEFAULT 'active' NOT NULL,
	FOREIGN KEY (`machine_id`) REFERENCES `machine`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `machine_heartbeat_machine_time_idx` ON `machine_heartbeat_log` (`machine_id`,`timestamp`);--> statement-breakpoint
CREATE INDEX `machine_heartbeat_time_idx` ON `machine_heartbeat_log` (`timestamp`);