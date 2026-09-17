/**
 * Polls every open generation batch and imports finished ones in chunks until nothing is
 * left to import.
 *
 *   npm run generation:poll            one pass; batches still processing are reported and skipped
 *   npm run generation:poll -- --wait  keep polling every 30s until every batch is imported
 */
import { parseArgs } from 'util'

import { importBatch, openBatchIds } from '../lib/generation/importBatch'

const { values } = parseArgs({ args: process.argv.slice(2), options: { wait: { type: 'boolean', default: false } } })

try {
  for (;;) {
    const ids = await openBatchIds()
    let stillProcessing = 0
    for (const id of ids) {
      for (;;) {
        const result = await importBatch(id)
        console.log(
          `batch doc ${id}: ${result.status}, imported ${result.imported}, errored ${result.errored}, remaining ${result.remaining}`,
        )
        if (result.status === 'in_progress') {
          stillProcessing++
          break
        }
        if (result.remaining === 0) break
      }
    }
    if (ids.length === 0) console.log('No open batches')
    if (!values.wait || stillProcessing === 0) break
    console.log(`${stillProcessing} batch(es) still processing; checking again in 30s`)
    await new Promise((resolve) => setTimeout(resolve, 30_000))
  }
} catch (error) {
  console.error(`Error: ${(error as Error).message}`)
  process.exit(1)
}

process.exit(0)
