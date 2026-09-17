import 'server-only'

import type Anthropic from '@anthropic-ai/sdk'
import type { Payload } from 'payload'

import { anthropic } from '@/lib/ai/client'
import { parseGeneratedArticle, type GeneratedArticle } from '@/lib/ai/schemas'
import { sectionsToLexical } from '@/lib/ai/toLexical'
import { getPayloadClient } from '@/lib/payload'
import type { GenerationBatch, KeywordCluster, Post } from '@/payload-types'

import type { ProductSnapshot } from './submitBatch'

export type ImportResult = {
  batchDocId: number
  status: GenerationBatch['status']
  imported: number
  errored: number
  remaining: number
}

type RequestRow = NonNullable<GenerationBatch['requests']>[number]

const idOf = (value: number | { id: number } | null | undefined) =>
  typeof value === 'object' && value !== null ? value.id : (value ?? undefined)

export const importChunkSize = () => Number(process.env.IMPORT_CHUNK_SIZE) || 50

/** Appends `-2`, `-3`, … until no other post or page on the domain uses the slug. */
async function freeSlug(payload: Payload, domainId: number, slug: string, ownPostId?: number): Promise<string> {
  for (let n = 1; ; n++) {
    const candidate = n === 1 ? slug : `${slug}-${n}`
    const [posts, pages] = await Promise.all([
      payload.count({
        collection: 'posts',
        where: {
          and: [
            { domain: { equals: domainId } },
            { slug: { equals: candidate } },
            ...(ownPostId ? [{ id: { not_equals: ownPostId } }] : []),
          ],
        },
      }),
      payload.count({
        collection: 'pages',
        where: { and: [{ domain: { equals: domainId } }, { slug: { equals: candidate } }] },
      }),
    ])
    if (posts.totalDocs === 0 && pages.totalDocs === 0) return candidate
  }
}

function describeFailure(result: Anthropic.Messages.MessageBatchResult): string {
  switch (result.type) {
    case 'errored':
      return `Request errored: ${result.error.error.type}: ${result.error.error.message}`
    case 'expired':
      return 'Request expired before it was processed'
    case 'canceled':
      return 'Request was canceled'
    default:
      return 'Unexpected result'
  }
}

/** Reads the article text from a succeeded message, rejecting refusals and truncated output. */
function articleText(message: Anthropic.Messages.Message): string {
  if (message.stop_reason !== 'end_turn') {
    throw new Error(`Generation stopped with stop_reason "${message.stop_reason}"`)
  }
  const text = message.content
    .filter((block): block is Anthropic.Messages.TextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('')
  if (!text) throw new Error('Generation returned no text')
  return text
}

async function savePost(
  payload: Payload,
  cluster: KeywordCluster,
  article: GeneratedArticle,
  products: ProductSnapshot[string],
): Promise<Post> {
  const domainId = idOf(cluster.targetDomain)!
  const existing = (
    await payload.find({
      collection: 'posts',
      where: { sourceCluster: { equals: cluster.id } },
      depth: 0,
      limit: 1,
    })
  ).docs[0]

  const byRef = new Map(products.map((p) => [p.id, p]))
  const { output } = article
  const content =
    article.template === 'listicle'
      ? {
          // Snapshot order is authoritative; titles and descriptions come from the model.
          products: products.map((product) => {
            const generated = article.output.products.find((p) => p.productRef === product.id)!
            return {
              title: generated.title,
              description: generated.description,
              imageUrl: product.imageUrl,
              affiliateUrl: product.affiliateUrl,
            }
          }),
        }
      : {
          body: sectionsToLexical(
            article.output.sections,
            Object.fromEntries([...byRef].map(([id, p]) => [id, p.affiliateUrl])),
          ),
        }

  const data = {
    title: output.title,
    slug: await freeSlug(payload, domainId, output.slug, existing?.id),
    intro: output.intro,
    summary: output.summary,
    meta: { title: output.meta.title, description: output.meta.description },
    ...content,
  }

  if (existing) {
    return payload.update({ collection: 'posts', id: existing.id, data, depth: 0 })
  }
  return payload.create({
    collection: 'posts',
    data: {
      ...data,
      domain: domainId,
      template: article.template,
      status: 'draft',
      sourceCluster: cluster.id,
    },
    depth: 0,
  })
}

/**
 * Imports up to `maxRows` pending results of one generation batch. Resumable and idempotent:
 * rows already `imported` or `errored` are skipped, and a post is found by its source cluster
 * before one is created. Call again until `remaining` is 0.
 */
export async function importBatch(
  batchDocId: number,
  { maxRows = importChunkSize() }: { maxRows?: number } = {},
): Promise<ImportResult> {
  const payload = await getPayloadClient()
  const doc = await payload.findByID({ collection: 'generation-batches', id: batchDocId, depth: 0 })
  const rows: RequestRow[] = doc.requests ?? []
  const pendingCount = () => rows.filter((r) => r.importState === 'pending').length
  const result = (status: GenerationBatch['status'], imported = 0, errored = 0): ImportResult => ({
    batchDocId,
    status,
    imported,
    errored,
    remaining: pendingCount(),
  })

  if (doc.status === 'imported' || doc.status === 'failed') return result(doc.status)

  const batch = await anthropic.messages.batches.retrieve(doc.anthropicBatchId)
  const counts = batch.request_counts
  if (batch.processing_status !== 'ended') {
    await payload.update({
      collection: 'generation-batches',
      id: batchDocId,
      data: { status: 'in_progress', requestCounts: counts },
    })
    return result('in_progress')
  }

  let imported = 0
  let errored = 0
  const pending = new Map(rows.filter((r) => r.importState === 'pending').map((r) => [r.customId, r]))
  const snapshot = (doc.productSnapshot ?? {}) as ProductSnapshot
  const erroredClusterIds: number[] = []

  if (pending.size > 0) {
    await payload.update({
      collection: 'generation-batches',
      id: batchDocId,
      data: { status: 'importing', requestCounts: counts, endedAt: batch.ended_at ?? undefined },
    })

    for await (const entry of await anthropic.messages.batches.results(doc.anthropicBatchId)) {
      if (imported + errored >= maxRows) break
      const row = pending.get(entry.custom_id)
      if (!row) continue
      pending.delete(entry.custom_id)

      const clusterId = idOf(row.cluster)!
      try {
        if (entry.result.type !== 'succeeded') throw new Error(describeFailure(entry.result))
        const message = entry.result.message
        row.inputTokens =
          message.usage.input_tokens +
          (message.usage.cache_creation_input_tokens ?? 0) +
          (message.usage.cache_read_input_tokens ?? 0)
        row.outputTokens = message.usage.output_tokens

        const cluster = await payload.findByID({ collection: 'keyword-clusters', id: clusterId, depth: 0 })
        const products = snapshot[entry.custom_id] ?? []
        const article = parseGeneratedArticle(
          cluster.targetTemplate,
          articleText(message),
          products.map((p) => p.id),
        )
        const post = await savePost(payload, cluster, article, products)
        await payload.update({ collection: 'keyword-clusters', id: clusterId, data: { post: post.id } })
        row.post = post.id
        row.importState = 'imported'
        row.error = null
        imported++
      } catch (error) {
        row.importState = 'errored'
        row.error = (error as Error).message
        erroredClusterIds.push(clusterId)
        errored++
      }
    }

    // Any pending row without a result in an ended batch can never be imported.
    if (imported + errored < maxRows) {
      for (const row of pending.values()) {
        if (imported + errored >= maxRows) break
        row.importState = 'errored'
        row.error = 'No result returned for this request'
        erroredClusterIds.push(idOf(row.cluster)!)
        errored++
      }
    }

    if (erroredClusterIds.length > 0) {
      await payload.update({
        collection: 'keyword-clusters',
        where: { id: { in: erroredClusterIds } },
        data: { status: 'unused' },
      })
    }
  }

  const done = pendingCount() === 0
  if (done) {
    const usedClusterIds = rows.filter((r) => r.importState === 'imported').map((r) => idOf(r.cluster)!)
    if (usedClusterIds.length > 0) {
      await payload.update({
        collection: 'keyword-clusters',
        where: { id: { in: usedClusterIds } },
        data: { status: 'used' },
      })
    }
  }

  const status = done ? 'imported' : 'importing'
  await payload.update({
    collection: 'generation-batches',
    id: batchDocId,
    data: {
      status,
      requestCounts: counts,
      endedAt: batch.ended_at ?? undefined,
      requests: rows.map((r) => ({ ...r, cluster: idOf(r.cluster)!, post: idOf(r.post) ?? null })),
      ...(done ? { importedAt: new Date().toISOString() } : {}),
    },
  })
  return result(status, imported, errored)
}

/** Batch docs that still need polling or importing. */
export async function openBatchIds(): Promise<number[]> {
  const payload = await getPayloadClient()
  const { docs } = await payload.find({
    collection: 'generation-batches',
    where: { status: { not_in: ['imported', 'failed'] } },
    sort: 'submittedAt',
    depth: 0,
    pagination: false,
    select: { status: true },
  })
  return docs.map((d) => d.id)
}

/** Clusters whose requests errored in a batch and are back to `unused`, for resubmission. */
export async function erroredClusterIds(batchDocId: number): Promise<number[]> {
  const payload = await getPayloadClient()
  const doc = await payload.findByID({ collection: 'generation-batches', id: batchDocId, depth: 0 })
  const ids = (doc.requests ?? []).filter((r) => r.importState === 'errored').map((r) => idOf(r.cluster)!)
  if (ids.length === 0) return []
  const { docs } = await payload.find({
    collection: 'keyword-clusters',
    where: { and: [{ id: { in: ids } }, { status: { equals: 'unused' } }] },
    depth: 0,
    pagination: false,
  })
  return docs.map((c) => c.id)
}
