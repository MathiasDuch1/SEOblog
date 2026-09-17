import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "domains" ADD COLUMN "affiliate_source" varchar DEFAULT 'mock' NOT NULL;
  ALTER TABLE "domains" ADD COLUMN "affiliate_marketplace" varchar;
  ALTER TABLE "domains" ADD COLUMN "affiliate_partner_tag" varchar;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "domains" DROP COLUMN "affiliate_source";
  ALTER TABLE "domains" DROP COLUMN "affiliate_marketplace";
  ALTER TABLE "domains" DROP COLUMN "affiliate_partner_tag";`)
}
