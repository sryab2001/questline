CREATE TABLE `checkins` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`dirty` integer DEFAULT true NOT NULL,
	`habit_id` text NOT NULL,
	`day` text NOT NULL,
	`scores_json` text NOT NULL,
	`avg` real NOT NULL
);
--> statement-breakpoint
CREATE TABLE `events` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`dirty` integer DEFAULT true NOT NULL,
	`kind` text NOT NULL,
	`ref` text NOT NULL,
	`day` text NOT NULL,
	`data_json` text
);
--> statement-breakpoint
ALTER TABLE `habits` ADD `cue` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `habits` ADD `place` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `habits` ADD `bundle` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `habits` ADD `min_target` real;--> statement-breakpoint
ALTER TABLE `habits` ADD `mastered_at` integer;--> statement-breakpoint
ALTER TABLE `habits` ADD `mastery_name` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `habits` ADD `mastery_title` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `settings` ADD `surprises_on` integer DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `settings` ADD `title` text DEFAULT '' NOT NULL;