CREATE INDEX "reminder_embedding_1536_hnsw_idx" ON "reminder_embedding" USING hnsw ((embedding::vector(1536)) vector_cosine_ops) WHERE dims = 1536;
--> statement-breakpoint
CREATE INDEX "reminder_embedding_768_hnsw_idx" ON "reminder_embedding" USING hnsw ((embedding::vector(768)) vector_cosine_ops) WHERE dims = 768;
--> statement-breakpoint
CREATE INDEX "reminder_embedding_1024_hnsw_idx" ON "reminder_embedding" USING hnsw ((embedding::vector(1024)) vector_cosine_ops) WHERE dims = 1024;
