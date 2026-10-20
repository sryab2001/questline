CREATE TABLE `class_quests` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`dirty` integer DEFAULT true NOT NULL,
	`name` text NOT NULL,
	`rating` text NOT NULL,
	`steps_json` text NOT NULL,
	`current_step` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'active' NOT NULL
);
--> statement-breakpoint
CREATE TABLE `day_results` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`dirty` integer DEFAULT true NOT NULL,
	`day` text NOT NULL,
	`cleared` integer NOT NULL,
	`total` integer NOT NULL,
	`penalty_json` text,
	`survival_status` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `day_results_day_idx` ON `day_results` (`day`);--> statement-breakpoint
CREATE TABLE `habits` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`dirty` integer DEFAULT true NOT NULL,
	`name` text NOT NULL,
	`stat` text NOT NULL,
	`target` real NOT NULL,
	`unit` text DEFAULT '' NOT NULL,
	`schedule` text DEFAULT 'daily' NOT NULL,
	`grade` text DEFAULT 'E' NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`archived` integer DEFAULT false NOT NULL,
	`start_day` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `logs` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`dirty` integer DEFAULT true NOT NULL,
	`habit_id` text NOT NULL,
	`day` text NOT NULL,
	`amount` real NOT NULL
);
--> statement-breakpoint
CREATE INDEX `logs_day_idx` ON `logs` (`day`);--> statement-breakpoint
CREATE INDEX `logs_habit_day_idx` ON `logs` (`habit_id`,`day`);--> statement-breakpoint
CREATE TABLE `purchases` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`dirty` integer DEFAULT true NOT NULL,
	`store_item_id` text NOT NULL,
	`cost` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`dirty` integer DEFAULT true NOT NULL,
	`player_name` text NOT NULL,
	`time_zone` text NOT NULL,
	`reset_hour` integer DEFAULT 0 NOT NULL,
	`server_url` text,
	`last_pull_at` integer
);
--> statement-breakpoint
CREATE TABLE `stat_allocations` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`dirty` integer DEFAULT true NOT NULL,
	`stat` text NOT NULL,
	`points` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `store_items` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`dirty` integer DEFAULT true NOT NULL,
	`name` text NOT NULL,
	`cost` integer NOT NULL,
	`kind` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `unlocks` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`dirty` integer DEFAULT true NOT NULL,
	`kind` text NOT NULL,
	`ref` text NOT NULL,
	`equipped` integer DEFAULT false NOT NULL
);
