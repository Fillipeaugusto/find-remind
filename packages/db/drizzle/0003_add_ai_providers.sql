CREATE TYPE "public"."ai_check_status" AS ENUM('ok', 'error');--> statement-breakpoint
CREATE TYPE "public"."ai_provider_kind" AS ENUM('ollama', 'openai', 'anthropic', 'google');--> statement-breakpoint
CREATE TABLE "ai_provider" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"kind" "ai_provider_kind" NOT NULL,
	"label" text NOT NULL,
	"base_url" text,
	"api_key_encrypted" text,
	"enabled" boolean DEFAULT true NOT NULL,
	"default_chat_model" text,
	"default_embedding_model" text,
	"last_checked_at" timestamp with time zone,
	"last_check_status" "ai_check_status",
	"last_check_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_user_settings" (
	"user_id" text PRIMARY KEY NOT NULL,
	"default_chat" text,
	"default_embedding" text
);
--> statement-breakpoint
ALTER TABLE "ai_provider" ADD CONSTRAINT "ai_provider_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_user_settings" ADD CONSTRAINT "ai_user_settings_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_provider_user_id_enabled_idx" ON "ai_provider" USING btree ("user_id","enabled");