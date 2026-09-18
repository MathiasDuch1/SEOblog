import 'server-only'

import { languageOf } from '@/lib/locales'
import { getPayloadClient } from '@/lib/payload'

import {
  detectConflicts,
  type ClusterCandidate,
  type ClusterConflict,
  type ExistingCluster,
  type ExistingPost,
} from './conflictRules'

export type { ClusterConflict, ConflictReason } from './conflictRules'

export type ConflictContext = {
  existing: ExistingCluster[]
  posts: ExistingPost[]
  language: string
}

/**
 * Everything conflict detection compares against for one domain: its clusters in any status
 * and its posts' titles. Other domains are never loaded, so separate country domains can
 * target the same topic.
 */
export async function loadConflictContext(domainId: number): Promise<ConflictContext> {
  const payload = await getPayloadClient()
  const domain = await payload.findByID({ collection: 'domains', id: domainId, depth: 0 })

  const [{ docs: clusters }, { docs: posts }] = await Promise.all([
    payload.find({
      collection: 'keyword-clusters',
      where: { targetDomain: { equals: domainId } },
      select: { clusterName: true, primaryKeyword: true, coreKeyword: true, keywords: true, status: true },
      depth: 0,
      pagination: false,
    }),
    payload.find({
      collection: 'posts',
      where: { domain: { equals: domainId } },
      select: { title: true, meta: { title: true } },
      depth: 0,
      pagination: false,
    }),
  ])

  return {
    existing: clusters.map((c) => ({
      id: c.id,
      status: c.status,
      clusterName: c.clusterName,
      primaryKeyword: c.primaryKeyword ?? '',
      coreKeyword: c.coreKeyword,
      keywords: c.keywords ?? [],
    })),
    posts: posts.map((p) => ({ id: p.id, title: p.title, metaTitle: p.meta?.title })),
    language: languageOf(domain.locale),
  }
}

/** Flags proposed clusters that would cannibalize an existing cluster (any status) or post on the same domain. */
export async function findConflicts(domainId: number, clusters: ClusterCandidate[]): Promise<ClusterConflict[]> {
  if (clusters.length === 0) return []
  const { existing, posts, language } = await loadConflictContext(domainId)
  return detectConflicts(clusters, existing, posts, language)
}
