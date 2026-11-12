CREATE TABLE `agent_logs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`task_id` text,
	`order_id` text,
	`level` text DEFAULT 'info' NOT NULL,
	`message` text NOT NULL,
	`screenshot_path` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `agent_state` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `agent_tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`order_id` text NOT NULL,
	`task_type` text NOT NULL,
	`target_channel` text NOT NULL,
	`status` text DEFAULT 'QUEUED' NOT NULL,
	`payload` text DEFAULT '{}' NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`screenshot_path` text,
	`error_message` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `agent_tasks_status_idx` ON `agent_tasks` (`status`,`created_at`);--> statement-breakpoint
CREATE TABLE `download_tokens` (
	`id` text PRIMARY KEY NOT NULL,
	`order_id` text NOT NULL,
	`product_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`expires_at` integer NOT NULL,
	`download_count` integer DEFAULT 0 NOT NULL,
	`max_downloads` integer DEFAULT 3 NOT NULL,
	`last_downloaded_at` integer,
	`client_ip_log` text DEFAULT '[]' NOT NULL,
	`is_revoked` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `download_tokens_token_hash_unique` ON `download_tokens` (`token_hash`);--> statement-breakpoint
CREATE INDEX `download_tokens_order_idx` ON `download_tokens` (`order_id`);--> statement-breakpoint
CREATE TABLE `orders` (
	`id` text PRIMARY KEY NOT NULL,
	`order_number` text NOT NULL,
	`product_id` text NOT NULL,
	`buyer_name` text NOT NULL,
	`depositor_name` text NOT NULL,
	`buyer_email` text,
	`buyer_instagram` text,
	`buyer_phone` text NOT NULL,
	`preferred_channel` text NOT NULL,
	`payment_method` text NOT NULL,
	`total_amount` integer NOT NULL,
	`status` text DEFAULT 'PENDING_VERIFICATION' NOT NULL,
	`agent_seen_at` integer,
	`reissue_requested_at` integer,
	`admin_memo` text,
	`created_at` integer NOT NULL,
	`approved_at` integer,
	`delivered_at` integer,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `orders_order_number_unique` ON `orders` (`order_number`);--> statement-breakpoint
CREATE INDEX `orders_status_idx` ON `orders` (`status`,`created_at`);--> statement-breakpoint
CREATE TABLE `products` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`subject` text,
	`grade` text DEFAULT '고2' NOT NULL,
	`difficulty` text,
	`question_count` integer,
	`page_count` integer,
	`price` integer NOT NULL,
	`description` text,
	`sample_pdf_url` text,
	`original_file_path` text,
	`original_file_name` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
