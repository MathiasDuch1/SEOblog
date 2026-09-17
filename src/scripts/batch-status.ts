import { anthropic } from '../lib/ai/client'
import { getPayloadClient } from '../lib/payload'

const payload = await getPayloadClient()
const { docs } = await payload.find({ collection: 'generation-batches', depth: 1, sort: 'id', pagination: false })
for (const doc of docs) {
  const batch = await anthropic.messages.batches.retrieve(doc.anthropicBatchId)
  const c = batch.request_counts
  const host = typeof doc.domain === 'object' ? doc.domain.hostname : doc.domain
  const age = Math.round((Date.now() - new Date(batch.created_at).getTime()) / 60000)
  console.log(
    `doc ${doc.id} ${host}: ${batch.processing_status} (${age} min old) — processing ${c.processing}, succeeded ${c.succeeded}, errored ${c.errored}, canceled ${c.canceled}, expired ${c.expired}; local status: ${doc.status}`,
  )
}
process.exit(0)
