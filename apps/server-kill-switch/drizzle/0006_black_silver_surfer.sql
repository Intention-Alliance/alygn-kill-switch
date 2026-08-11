CREATE TABLE `kill_authorization_request` (
	`id` text PRIMARY KEY NOT NULL,
	`action` text NOT NULL,
	`target` text NOT NULL,
	`initiated_by` text NOT NULL,
	`initiated_by_credential_id` text NOT NULL,
	`initiated_at` integer NOT NULL,
	`status` text DEFAULT 'PENDING_QUORUM' NOT NULL,
	`signatures` text DEFAULT '[]' NOT NULL,
	`executed_at` integer,
	`timeout_ms` integer DEFAULT 600000 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `kill_authorization_request_status_idx` ON `kill_authorization_request` (`status`);--> statement-breakpoint
CREATE INDEX `kill_authorization_request_initiated_at_idx` ON `kill_authorization_request` (`initiated_at`);--> statement-breakpoint
CREATE INDEX `kill_authorization_request_target_idx` ON `kill_authorization_request` (`target`);--> statement-breakpoint
CREATE TABLE `webauthn_credential` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`credential_id` text NOT NULL,
	`public_key` text NOT NULL,
	`counter` integer DEFAULT 0 NOT NULL,
	`transports` text,
	`name` text,
	`created_at` integer NOT NULL,
	`revoked_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `webauthn_credential_credential_id_unique` ON `webauthn_credential` (`credential_id`);--> statement-breakpoint
CREATE INDEX `webauthn_credential_user_id_idx` ON `webauthn_credential` (`user_id`);--> statement-breakpoint
CREATE INDEX `webauthn_credential_active_idx` ON `webauthn_credential` (`revoked_at`);