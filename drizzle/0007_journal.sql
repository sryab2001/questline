CREATE TABLE `journal` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`dirty` integer DEFAULT true NOT NULL,
	`day` text NOT NULL,
	`mood` integer DEFAULT 0 NOT NULL,
	`energy` integer DEFAULT 0 NOT NULL,
	`text` text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE INDEX `journal_day_idx` ON `journal` (`day`);--> statement-breakpoint
ALTER TABLE `settings` ADD `ai_reads_writing` integer DEFAULT false NOT NULL;