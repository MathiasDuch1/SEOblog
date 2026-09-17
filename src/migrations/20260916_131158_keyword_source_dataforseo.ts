import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "keyword_clusters" ALTER COLUMN "source" SET DATA TYPE text;
  UPDATE "keyword_clusters" SET "source" = 'manual';
  ALTER TABLE "keyword_clusters" ALTER COLUMN "source" SET DEFAULT 'manual'::text;
  DROP TYPE "public"."enum_keyword_clusters_source";
  CREATE TYPE "public"."enum_keyword_clusters_source" AS ENUM('dataforseo', 'manual');
  ALTER TABLE "keyword_clusters" ALTER COLUMN "source" SET DEFAULT 'manual'::"public"."enum_keyword_clusters_source";
  ALTER TABLE "keyword_clusters" ALTER COLUMN "source" SET DATA TYPE "public"."enum_keyword_clusters_source" USING "source"::"public"."enum_keyword_clusters_source";`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "keyword_clusters" ALTER COLUMN "source" SET DATA TYPE text;
  UPDATE "keyword_clusters" SET "source" = 'semrush';
  ALTER TABLE "keyword_clusters" ALTER COLUMN "source" SET DEFAULT 'semrush'::text;
  DROP TYPE "public"."enum_keyword_clusters_source";
  CREATE TYPE "public"."enum_keyword_clusters_source" AS ENUM('semrush');
  ALTER TABLE "keyword_clusters" ALTER COLUMN "source" SET DEFAULT 'semrush'::"public"."enum_keyword_clusters_source";
  ALTER TABLE "keyword_clusters" ALTER COLUMN "source" SET DATA TYPE "public"."enum_keyword_clusters_source" USING "source"::"public"."enum_keyword_clusters_source";`)
}
