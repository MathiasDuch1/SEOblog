import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_generation_batches_requests_import_state" AS ENUM('pending', 'imported', 'errored');
  CREATE TYPE "public"."enum_generation_batches_status" AS ENUM('submitted', 'in_progress', 'ended', 'importing', 'imported', 'failed');
  CREATE TABLE "generation_batches_requests" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"custom_id" varchar NOT NULL,
  	"cluster_id" integer NOT NULL,
  	"post_id" integer,
  	"import_state" "enum_generation_batches_requests_import_state" DEFAULT 'pending' NOT NULL,
  	"error" varchar,
  	"input_tokens" numeric,
  	"output_tokens" numeric
  );
  
  CREATE TABLE "generation_batches" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"anthropic_batch_id" varchar NOT NULL,
  	"domain_id" integer NOT NULL,
  	"auto_schedule" boolean DEFAULT false,
  	"status" "enum_generation_batches_status" DEFAULT 'submitted' NOT NULL,
  	"product_snapshot" jsonb,
  	"submitted_at" timestamp(3) with time zone,
  	"ended_at" timestamp(3) with time zone,
  	"imported_at" timestamp(3) with time zone,
  	"request_counts_processing" numeric,
  	"request_counts_succeeded" numeric,
  	"request_counts_errored" numeric,
  	"request_counts_canceled" numeric,
  	"request_counts_expired" numeric,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "posts" ADD COLUMN "source_cluster_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "generation_batches_id" integer;
  ALTER TABLE "generation_batches_requests" ADD CONSTRAINT "generation_batches_requests_cluster_id_keyword_clusters_id_fk" FOREIGN KEY ("cluster_id") REFERENCES "public"."keyword_clusters"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "generation_batches_requests" ADD CONSTRAINT "generation_batches_requests_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "generation_batches_requests" ADD CONSTRAINT "generation_batches_requests_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."generation_batches"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "generation_batches" ADD CONSTRAINT "generation_batches_domain_id_domains_id_fk" FOREIGN KEY ("domain_id") REFERENCES "public"."domains"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "generation_batches_requests_order_idx" ON "generation_batches_requests" USING btree ("_order");
  CREATE INDEX "generation_batches_requests_parent_id_idx" ON "generation_batches_requests" USING btree ("_parent_id");
  CREATE INDEX "generation_batches_requests_cluster_idx" ON "generation_batches_requests" USING btree ("cluster_id");
  CREATE INDEX "generation_batches_requests_post_idx" ON "generation_batches_requests" USING btree ("post_id");
  CREATE UNIQUE INDEX "generation_batches_anthropic_batch_id_idx" ON "generation_batches" USING btree ("anthropic_batch_id");
  CREATE INDEX "generation_batches_domain_idx" ON "generation_batches" USING btree ("domain_id");
  CREATE INDEX "generation_batches_status_idx" ON "generation_batches" USING btree ("status");
  CREATE INDEX "generation_batches_updated_at_idx" ON "generation_batches" USING btree ("updated_at");
  CREATE INDEX "generation_batches_created_at_idx" ON "generation_batches" USING btree ("created_at");
  ALTER TABLE "posts" ADD CONSTRAINT "posts_source_cluster_id_keyword_clusters_id_fk" FOREIGN KEY ("source_cluster_id") REFERENCES "public"."keyword_clusters"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_generation_batches_fk" FOREIGN KEY ("generation_batches_id") REFERENCES "public"."generation_batches"("id") ON DELETE cascade ON UPDATE no action;
  CREATE UNIQUE INDEX "posts_source_cluster_idx" ON "posts" USING btree ("source_cluster_id");
  CREATE INDEX "payload_locked_documents_rels_generation_batches_id_idx" ON "payload_locked_documents_rels" USING btree ("generation_batches_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "generation_batches_requests" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "generation_batches" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "generation_batches_requests" CASCADE;
  DROP TABLE "generation_batches" CASCADE;
  ALTER TABLE "posts" DROP CONSTRAINT "posts_source_cluster_id_keyword_clusters_id_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_generation_batches_fk";
  
  DROP INDEX "posts_source_cluster_idx";
  DROP INDEX "payload_locked_documents_rels_generation_batches_id_idx";
  ALTER TABLE "posts" DROP COLUMN "source_cluster_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "generation_batches_id";
  DROP TYPE "public"."enum_generation_batches_requests_import_state";
  DROP TYPE "public"."enum_generation_batches_status";`)
}
