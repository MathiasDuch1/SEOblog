import 'server-only'

import { sql, type PostgresAdapter } from '@payloadcms/db-postgres'

import { getPayloadClient } from '@/lib/payload'

/**
 * Records a cron run on the `scheduler-status` global. Never throws: failing to record health
 * must not fail the run it describes.
 *
 * Written with a column-scoped SQL UPDATE rather than `updateGlobal`. Payload rewrites the
 * whole global row, so a publish run and a generation poll finishing together would overwrite
 * each other's fields with the stale values they read first.
 *
 * The global's single row must already exist: the migration inserts it, and the seed creates
 * it in dev. Payload would otherwise create it on first write, once per concurrent run.
 */
export async function recordSchedulerRun(kind: 'publish' | 'generation', result: unknown): Promise<void> {
  const payload = await getPayloadClient()
  const db = payload.db as unknown as PostgresAdapter
  const at = new Date().toISOString()
  const json = JSON.stringify(result)
  try {
    await db.drizzle.execute(
      kind === 'publish'
        ? sql`UPDATE "scheduler_status" SET "last_publish_run_at" = ${at}, "last_publish_result" = ${json}::jsonb, "updated_at" = ${at}`
        : sql`UPDATE "scheduler_status" SET "last_generation_poll_at" = ${at}, "last_generation_poll_result" = ${json}::jsonb, "updated_at" = ${at}`,
    )
  } catch (error) {
    payload.logger.error({ err: error, kind }, 'Could not record scheduler run')
  }
}
