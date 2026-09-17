import 'server-only'

import type Anthropic from '@anthropic-ai/sdk'

import { getProductSource, type Product } from '@/lib/affiliate'
import { anthropic, generationEffort, generationModel } from '@/lib/ai/client'
import { informationalSystem, informationalUserMessage } from '@/lib/ai/prompts/informational'
import { listicleSystem, listicleUserMessage } from '@/lib/ai/prompts/listicle'
import { outputFormatFor } from '@/lib/ai/schemas'
import { getPayloadClient } from '@/lib/payload'
import type { Domain, KeywordCluster } from '@/payload-types'

/** Products offered to a listicle; every one becomes a product block. */
export const PRODUCTS_PER_LISTICLE = 5
/** Products an informational article may link to inline. */
export const LINK_PRODUCTS_PER_INFORMATIONAL = 3

// Message Batches API limits are 100,000 requests or 256 MB per batch; stay under both.
const MAX_REQUESTS_PER_BATCH = 100_000
const MAX_BYTES_PER_BATCH = 200 * 1024 * 1024

export type ProductSnapshot = Record<string, Product[]>

export type SubmittedBatch = {
  batchDocId: number
  anthropicBatchId: string
  requestCount: number
}

type BatchRequest = Anthropic.Messages.BatchCreateParams.Request

const idOf = (value: number | { id: number } | null | undefined) =>
  typeof value === 'object' && value !== null ? value.id : value

export const customIdFor = (clusterId: number) => `c${clusterId}`

/** Primary keyword is the first keyword until phase 05 adds an explicit field. */
function keywordsOf(cluster: KeywordCluster) {
  const keywords = cluster.keywords.map((k) => k.keyword.trim()).filter(Boolean)
  return { primaryKeyword: keywords[0] ?? cluster.clusterName, supportingKeywords: keywords.slice(1) }
}

function buildRequest(cluster: KeywordCluster, domain: Domain, products: Product[]): BatchRequest {
  const template = cluster.targetTemplate
  const input = { domainName: domain.name, locale: domain.locale, ...keywordsOf(cluster), products }
  return {
    custom_id: customIdFor(cluster.id),
    params: {
      model: generationModel(),
      max_tokens: 16000,
      thinking: { type: 'adaptive' },
      output_config: { effort: generationEffort(), format: outputFormatFor(template) },
      system: template === 'listicle' ? listicleSystem() : informationalSystem(),
      messages: [
        {
          role: 'user',
          content: template === 'listicle' ? listicleUserMessage(input) : informationalUserMessage(input),
        },
      ],
    },
  }
}

/** Splits requests so each batch stays under the API's request-count and size limits. */
function splitRequests(requests: BatchRequest[]): BatchRequest[][] {
  const groups: BatchRequest[][] = []
  let current: BatchRequest[] = []
  let bytes = 0
  for (const request of requests) {
    const size = Buffer.byteLength(JSON.stringify(request))
    if (current.length > 0 && (current.length >= MAX_REQUESTS_PER_BATCH || bytes + size > MAX_BYTES_PER_BATCH)) {
      groups.push(current)
      current = []
      bytes = 0
    }
    current.push(request)
    bytes += size
  }
  if (current.length > 0) groups.push(current)
  return groups
}

/**
 * Submits one Message Batch (or several, if the API limits require) for `unused` clusters
 * that all target the same domain. Batch docs are created and clusters marked `assigned`
 * only after the API accepts a batch, so a failed submission changes nothing.
 */
export async function submitBatch({
  clusterIds,
  autoSchedule = false,
}: {
  clusterIds: number[]
  autoSchedule?: boolean
}): Promise<SubmittedBatch[]> {
  if (clusterIds.length === 0) throw new Error('No clusters given')
  const payload = await getPayloadClient()

  const { docs: clusters } = await payload.find({
    collection: 'keyword-clusters',
    where: { id: { in: clusterIds } },
    depth: 1,
    limit: clusterIds.length,
    pagination: false,
  })

  const missing = clusterIds.filter((id) => !clusters.some((c) => c.id === id))
  if (missing.length > 0) throw new Error(`Clusters not found: ${missing.join(', ')}`)

  const notUnused = clusters.filter((c) => c.status !== 'unused')
  if (notUnused.length > 0) {
    throw new Error(
      `Only unused clusters can be submitted. Not unused: ${notUnused.map((c) => `${c.id} (${c.status})`).join(', ')}`,
    )
  }

  const domainIds = [...new Set(clusters.map((c) => idOf(c.targetDomain)))]
  if (domainIds.length !== 1) {
    throw new Error(`A batch targets exactly one domain; these clusters target domains ${domainIds.join(', ')}`)
  }
  const domain = clusters[0].targetDomain as Domain
  const productSource = getProductSource(domain)

  const snapshot: ProductSnapshot = {}
  const requests: BatchRequest[] = []
  for (const cluster of clusters) {
    const { primaryKeyword, supportingKeywords } = keywordsOf(cluster)
    const products = await productSource.findProducts({
      keywords: [primaryKeyword, ...supportingKeywords],
      domain,
      limit: cluster.targetTemplate === 'listicle' ? PRODUCTS_PER_LISTICLE : LINK_PRODUCTS_PER_INFORMATIONAL,
    })
    if (cluster.targetTemplate === 'listicle' && products.length === 0) {
      throw new Error(`No products found for listicle cluster ${cluster.id} on ${domain.hostname}`)
    }
    snapshot[customIdFor(cluster.id)] = products
    requests.push(buildRequest(cluster, domain, products))
  }

  const submitted: SubmittedBatch[] = []
  for (const group of splitRequests(requests)) {
    const batch = await anthropic.messages.batches.create({ requests: group })

    const groupClusterIds = group.map((r) => Number(r.custom_id.slice(1)))
    const doc = await payload.create({
      collection: 'generation-batches',
      data: {
        anthropicBatchId: batch.id,
        domain: domain.id,
        autoSchedule,
        status: batch.processing_status === 'ended' ? 'ended' : 'submitted',
        submittedAt: new Date().toISOString(),
        requests: group.map((r) => ({
          customId: r.custom_id,
          cluster: Number(r.custom_id.slice(1)),
          importState: 'pending' as const,
        })),
        productSnapshot: Object.fromEntries(group.map((r) => [r.custom_id, snapshot[r.custom_id]])),
        requestCounts: batch.request_counts,
      },
    })
    await payload.update({
      collection: 'keyword-clusters',
      where: { id: { in: groupClusterIds } },
      data: { status: 'assigned' },
    })
    submitted.push({ batchDocId: doc.id, anthropicBatchId: batch.id, requestCount: group.length })
  }
  return submitted
}

/** `unused` cluster IDs per domain in a niche, for submitting a niche's month of content. */
export async function unusedClustersByDomainInNiche(nicheSlug: string): Promise<Map<Domain, number[]>> {
  const payload = await getPayloadClient()
  const { docs: niches } = await payload.find({
    collection: 'niches',
    where: { slug: { equals: nicheSlug } },
    limit: 1,
  })
  if (!niches[0]) throw new Error(`Niche not found: ${nicheSlug}`)

  const { docs: domains } = await payload.find({
    collection: 'domains',
    where: { niche: { equals: niches[0].id } },
    depth: 0,
    pagination: false,
  })

  const result = new Map<Domain, number[]>()
  for (const domain of domains) {
    const { docs } = await payload.find({
      collection: 'keyword-clusters',
      where: { and: [{ targetDomain: { equals: domain.id } }, { status: { equals: 'unused' } }] },
      depth: 0,
      pagination: false,
    })
    if (docs.length > 0) result.set(domain, docs.map((c) => c.id))
  }
  return result
}
