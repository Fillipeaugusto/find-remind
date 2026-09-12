CREATE TYPE "public"."reminder_kind" AS ENUM('reminder', 'note');--> statement-breakpoint
CREATE TYPE "public"."reminder_status" AS ENUM('scheduled', 'done', 'dismissed', 'snoozed');--> statement-breakpoint
CREATE TABLE "alert" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reminder_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"fired_at" timestamp with time zone DEFAULT now() NOT NULL,
	"read_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "reminder" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"title" text NOT NULL,
	"content" text,
	"kind" "reminder_kind" DEFAULT 'reminder' NOT NULL,
	"remind_at" timestamp with time zone,
	"recurrence" jsonb,
	"status" "reminder_status" DEFAULT 'scheduled' NOT NULL,
	"snoozed_until" timestamp with time zone,
	"next_fire_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "reminder_tag" (
	"reminder_id" uuid NOT NULL,
	"tag" text NOT NULL,
	CONSTRAINT "reminder_tag_reminder_id_tag_pk" PRIMARY KEY("reminder_id","tag")
);
--> statement-breakpoint
ALTER TABLE "alert" ADD CONSTRAINT "alert_reminder_id_reminder_id_fk" FOREIGN KEY ("reminder_id") REFERENCES "public"."reminder"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alert" ADD CONSTRAINT "alert_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reminder" ADD CONSTRAINT "reminder_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reminder_tag" ADD CONSTRAINT "reminder_tag_reminder_id_reminder_id_fk" FOREIGN KEY ("reminder_id") REFERENCES "public"."reminder"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "alert_user_id_fired_at_idx" ON "alert" USING btree ("user_id","fired_at");--> statement-breakpoint
CREATE INDEX "alert_user_id_read_at_idx" ON "alert" USING btree ("user_id","read_at");--> statement-breakpoint
CREATE UNIQUE INDEX "alert_reminder_id_fired_at_idx" ON "alert" USING btree ("reminder_id","fired_at");--> statement-breakpoint
CREATE INDEX "reminder_user_id_status_idx" ON "reminder" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "reminder_user_id_next_fire_at_idx" ON "reminder" USING btree ("user_id","next_fire_at");