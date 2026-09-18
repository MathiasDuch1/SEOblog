import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   -- Existing domains are backfilled from their locale (language, and the country's location
  -- code where known) so the columns can be NOT NULL; check each one in the admin.
  ALTER TABLE "domains" ADD COLUMN "dataforseo_location_code" numeric;
  ALTER TABLE "domains" ADD COLUMN "dataforseo_language_code" varchar;
  UPDATE "domains" SET
    "dataforseo_language_code" = split_part("locale", '-', 1),
    "dataforseo_location_code" = CASE split_part("locale", '-', 2) WHEN 'US' THEN 2840 WHEN 'DK' THEN 2208 ELSE 0 END;
  ALTER TABLE "domains" ALTER COLUMN "dataforseo_location_code" SET NOT NULL;
  ALTER TABLE "domains" ALTER COLUMN "dataforseo_language_code" SET NOT NULL;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "domains" DROP COLUMN "dataforseo_location_code";
  ALTER TABLE "domains" DROP COLUMN "dataforseo_language_code";`)
}
