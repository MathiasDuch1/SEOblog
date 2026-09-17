import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   -- Existing domains get UTC so the column can be NOT NULL; set each one's real timezone in the admin.
  ALTER TABLE "domains" ADD COLUMN "timezone" varchar;
  UPDATE "domains" SET "timezone" = 'UTC' WHERE "timezone" IS NULL;
  ALTER TABLE "domains" ALTER COLUMN "timezone" SET NOT NULL;
  ALTER TABLE "domains" ADD COLUMN "schedule_posts_per_day" numeric DEFAULT 10 NOT NULL;
  ALTER TABLE "domains" ADD COLUMN "schedule_window_start" varchar DEFAULT '08:00' NOT NULL;
  ALTER TABLE "domains" ADD COLUMN "schedule_window_end" varchar DEFAULT '23:30' NOT NULL;
  ALTER TABLE "domains" ADD COLUMN "schedule_jitter_minutes" numeric DEFAULT 8 NOT NULL;
  ALTER TABLE "domains" ADD COLUMN "index_now_key" varchar;
  UPDATE "domains" SET "index_now_key" = md5(random()::text || "id"::text) WHERE "index_now_key" IS NULL;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "domains" DROP COLUMN "timezone";
  ALTER TABLE "domains" DROP COLUMN "schedule_posts_per_day";
  ALTER TABLE "domains" DROP COLUMN "schedule_window_start";
  ALTER TABLE "domains" DROP COLUMN "schedule_window_end";
  ALTER TABLE "domains" DROP COLUMN "schedule_jitter_minutes";
  ALTER TABLE "domains" DROP COLUMN "index_now_key";`)
}
