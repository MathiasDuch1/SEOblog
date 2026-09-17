import { isAuthorizedCronRequest } from '@/lib/cron'
import { importBatch, openBatchIds, type ImportResult } from '@/lib/generation/importBatch'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
// One chunk per open batch must finish well inside this; tune IMPORT_CHUNK_SIZE to the host (phase 07).
export const maxDuration = 300

/**
 * Cron entry point for generation: polls each open batch and imports one chunk of its
 * results. Reachable only on the admin host (see src/proxy.ts). Hero images (phase 03
 * step 9) are deferred, so no image chunk runs here yet.
 */
export async function GET(request: Request) {
  if (!isAuthorizedCronRequest(request)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const batches: ImportResult[] = []
  const errors: { batchDocId: number; error: string }[] = []
  for (const id of await openBatchIds()) {
    try {
      batches.push(await importBatch(id))
    } catch (error) {
      errors.push({ batchDocId: id, error: (error as Error).message })
    }
  }

  return Response.json({ batches, errors })
}
