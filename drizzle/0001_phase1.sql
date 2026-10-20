ALTER TABLE `day_results` ADD `outcomes_json` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `day_results` ADD `acknowledged` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `settings` ADD `last_seen_level` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `settings` ADD `morning_hour` integer DEFAULT 7 NOT NULL;--> statement-breakpoint
ALTER TABLE `settings` ADD `warning_hour` integer DEFAULT 21 NOT NULL;