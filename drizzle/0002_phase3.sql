CREATE TABLE `skill_uses` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`dirty` integer DEFAULT true NOT NULL,
	`skill` text NOT NULL,
	`day` text NOT NULL
);
--> statement-breakpoint
ALTER TABLE `purchases` ADD `kind` text DEFAULT 'treat' NOT NULL;--> statement-breakpoint
ALTER TABLE `purchases` ADD `day` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `purchases` ADD `result_json` text;--> statement-breakpoint
ALTER TABLE `settings` ADD `onboarded` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `settings` ADD `sound_on` integer DEFAULT true NOT NULL;