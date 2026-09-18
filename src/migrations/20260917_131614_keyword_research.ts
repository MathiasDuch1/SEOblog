import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_keyword_clusters_keywords_intent" AS ENUM('informational', 'navigational', 'commercial', 'transactional');
  CREATE TYPE "public"."enum_keyword_clusters_suggested_template" AS ENUM('listicle', 'informational');
  CREATE TYPE "public"."enum_keyword_research_runs_endpoints" AS ENUM('related_keywords', 'keyword_suggestions', 'keyword_ideas');
  CREATE TYPE "public"."enum_keyword_research_runs_status" AS ENUM('running', 'complete', 'failed');
  CREATE TABLE "keyword_research_runs_seed_keywords" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"keyword" varchar NOT NULL
  );
  
  CREATE TABLE "keyword_research_runs_endpoints" (
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"value" "enum_keyword_research_runs_endpoints",
  	"id" serial PRIMARY KEY NOT NULL
  );
  
  CREATE TABLE "keyword_research_runs" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"label" varchar,
  	"domain_id" integer NOT NULL,
  	"location_code" numeric NOT NULL,
  	"language_code" varchar NOT NULL,
  	"limit_per_endpoint" numeric NOT NULL,
  	"request_key" varchar NOT NULL,
  	"status" "enum_keyword_research_runs_status" DEFAULT 'running' NOT NULL,
  	"cost_usd" numeric DEFAULT 0,
  	"row_count" numeric DEFAULT 0,
  	"rows" jsonb,
  	"error" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "keyword_clusters_keywords" ADD COLUMN "keyword_difficulty" numeric;
  ALTER TABLE "keyword_clusters_keywords" ADD COLUMN "cpc" numeric;
  ALTER TABLE "keyword_clusters_keywords" ADD COLUMN "intent" "enum_keyword_clusters_keywords_intent";
  ALTER TABLE "keyword_clusters" ADD COLUMN "primary_keyword" varchar;
  ALTER TABLE "keyword_clusters" ADD COLUMN "core_keyword" varchar;
  ALTER TABLE "keyword_clusters" ADD COLUMN "rationale" varchar;
  ALTER TABLE "keyword_clusters" ADD COLUMN "suggested_template" "enum_keyword_clusters_suggested_template";
  ALTER TABLE "keyword_clusters" ADD COLUMN "research_run_id" integer;
  -- Existing clusters target their first keyword, which is what generation used until now.
  UPDATE "keyword_clusters" c SET "primary_keyword" = (
    SELECT k."keyword" FROM "keyword_clusters_keywords" k WHERE k."_parent_id" = c."id" ORDER BY k."_order" LIMIT 1
  ) WHERE c."primary_keyword" IS NULL;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "keyword_research_runs_id" integer;
  ALTER TABLE "keyword_research_runs_seed_keywords" ADD CONSTRAINT "keyword_research_runs_seed_keywords_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."keyword_research_runs"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "keyword_research_runs_endpoints" ADD CONSTRAINT "keyword_research_runs_endpoints_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."keyword_research_runs"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "keyword_research_runs" ADD CONSTRAINT "keyword_research_runs_domain_id_domains_id_fk" FOREIGN KEY ("domain_id") REFERENCES "public"."domains"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "keyword_research_runs_seed_keywords_order_idx" ON "keyword_research_runs_seed_keywords" USING btree ("_order");
  CREATE INDEX "keyword_research_runs_seed_keywords_parent_id_idx" ON "keyword_research_runs_seed_keywords" USING btree ("_parent_id");
  CREATE INDEX "keyword_research_runs_endpoints_order_idx" ON "keyword_research_runs_endpoints" USING btree ("order");
  CREATE INDEX "keyword_research_runs_endpoints_parent_idx" ON "keyword_research_runs_endpoints" USING btree ("parent_id");
  CREATE INDEX "keyword_research_runs_domain_idx" ON "keyword_research_runs" USING btree ("domain_id");
  CREATE INDEX "keyword_research_runs_request_key_idx" ON "keyword_research_runs" USING btree ("request_key");
  CREATE INDEX "keyword_research_runs_status_idx" ON "keyword_research_runs" USING btree ("status");
  CREATE INDEX "keyword_research_runs_updated_at_idx" ON "keyword_research_runs" USING btree ("updated_at");
  CREATE INDEX "keyword_research_runs_created_at_idx" ON "keyword_research_runs" USING btree ("created_at");
  ALTER TABLE "keyword_clusters" ADD CONSTRAINT "keyword_clusters_research_run_id_keyword_research_runs_id_fk" FOREIGN KEY ("research_run_id") REFERENCES "public"."keyword_research_runs"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_keyword_research_runs_fk" FOREIGN KEY ("keyword_research_runs_id") REFERENCES "public"."keyword_research_runs"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "keyword_clusters_primary_keyword_idx" ON "keyword_clusters" USING btree ("primary_keyword");
  CREATE INDEX "keyword_clusters_core_keyword_idx" ON "keyword_clusters" USING btree ("core_keyword");
  CREATE INDEX "keyword_clusters_research_run_idx" ON "keyword_clusters" USING btree ("research_run_id");
  CREATE INDEX "payload_locked_documents_rels_keyword_research_runs_id_idx" ON "payload_locked_documents_rels" USING btree ("keyword_research_runs_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "keyword_research_runs_seed_keywords" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "keyword_research_runs_endpoints" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "keyword_research_runs" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "keyword_research_runs_seed_keywords" CASCADE;
  DROP TABLE "keyword_research_runs_endpoints" CASCADE;
  DROP TABLE "keyword_research_runs" CASCADE;
  ALTER TABLE "keyword_clusters" DROP CONSTRAINT "keyword_clusters_research_run_id_keyword_research_runs_id_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_keyword_research_runs_fk";
  
  DROP INDEX "keyword_clusters_primary_keyword_idx";
  DROP INDEX "keyword_clusters_core_keyword_idx";
  DROP INDEX "keyword_clusters_research_run_idx";
  DROP INDEX "payload_locked_documents_rels_keyword_research_runs_id_idx";
  ALTER TABLE "keyword_clusters_keywords" DROP COLUMN "keyword_difficulty";
  ALTER TABLE "keyword_clusters_keywords" DROP COLUMN "cpc";
  ALTER TABLE "keyword_clusters_keywords" DROP COLUMN "intent";
  ALTER TABLE "keyword_clusters" DROP COLUMN "primary_keyword";
  ALTER TABLE "keyword_clusters" DROP COLUMN "core_keyword";
  ALTER TABLE "keyword_clusters" DROP COLUMN "rationale";
  ALTER TABLE "keyword_clusters" DROP COLUMN "suggested_template";
  ALTER TABLE "keyword_clusters" DROP COLUMN "research_run_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "keyword_research_runs_id";
  DROP TYPE "public"."enum_keyword_clusters_keywords_intent";
  DROP TYPE "public"."enum_keyword_clusters_suggested_template";
  DROP TYPE "public"."enum_keyword_research_runs_endpoints";
  DROP TYPE "public"."enum_keyword_research_runs_status";`)
}
