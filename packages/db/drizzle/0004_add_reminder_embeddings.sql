CREATE EXTENSION IF NOT EXISTS vector;
--> statement-breakpoint
CREATE TABLE "reminder_embedding" (
	"reminder_id" uuid PRIMARY KEY NOT NULL,
	"model" text NOT NULL,
	"dims" integer NOT NULL,
	"embedding" vector NOT NULL,
	CONSTRAINT "reminder_embedding_dims_check" CHECK ("reminder_embedding"."dims" between 1 and 16000 and vector_dims("reminder_embedding"."embedding") = "reminder_embedding"."dims")
);
--> statement-breakpoint
ALTER TABLE "reminder_embedding" ADD CONSTRAINT "reminder_embedding_reminder_id_reminder_id_fk" FOREIGN KEY ("reminder_id") REFERENCES "public"."reminder"("id") ON DELETE cascade ON UPDATE no action;